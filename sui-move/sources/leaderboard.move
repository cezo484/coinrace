/// On-chain leaderboard for Coin Race. One shared board holds the ten
/// best runs. Each player keeps only their best score.
module coinrace::leaderboard;

use std::string::String;
use sui::event;

const MAX_ENTRIES: u64 = 10;
const MAX_NAME_BYTES: u64 = 24;

const ENameTooLong: u64 = 1;

public struct Entry has copy, drop, store {
    player: address,
    name: String,
    score: u64,
}

public struct Leaderboard has key {
    id: UID,
    entries: vector<Entry>,
}

public struct ScoreSubmitted has copy, drop {
    player: address,
    score: u64,
}

fun init(ctx: &mut TxContext) {
    transfer::share_object(Leaderboard {
        id: object::new(ctx),
        entries: vector[],
    });
}

#[test_only]
public fun init_for_test(ctx: &mut TxContext) {
    init(ctx);
}

public fun entries(board: &Leaderboard): &vector<Entry> {
    &board.entries
}

public fun entry_player(entry: &Entry): address {
    entry.player
}

public fun entry_name(entry: &Entry): &String {
    &entry.name
}

public fun entry_score(entry: &Entry): u64 {
    entry.score
}

public fun best_score(board: &Leaderboard): u64 {
    if (board.entries.is_empty()) {
        0
    } else {
        board.entries[0].score
    }
}

public fun submit_score(board: &mut Leaderboard, name: String, score: u64, ctx: &mut TxContext) {
    assert!(name.length() <= MAX_NAME_BYTES, ENameTooLong);
    let player = ctx.sender();

    let mut i = 0;
    while (i < board.entries.length()) {
        if (board.entries[i].player == player) {
            if (score <= board.entries[i].score) {
                return
            };
            board.entries.remove(i);
            break
        };
        i = i + 1;
    };

    if (board.entries.length() >= MAX_ENTRIES) {
        let lowest = board.entries[board.entries.length() - 1].score;
        if (score <= lowest) {
            return
        };
    };

    let mut pos = 0;
    while (pos < board.entries.length() && board.entries[pos].score >= score) {
        pos = pos + 1;
    };
    board.entries.insert(Entry { player, name, score }, pos);
    while (board.entries.length() > MAX_ENTRIES) {
        board.entries.pop_back();
    };

    event::emit(ScoreSubmitted { player, score });
}
