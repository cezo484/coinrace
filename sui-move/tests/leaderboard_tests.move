#[test_only]
module coinrace::leaderboard_tests;

use coinrace::leaderboard::{Self, Leaderboard};
use std::string::utf8;
use sui::test_scenario;

#[test]
fun keeps_top_ten_sorted() {
    let mut scenario = test_scenario::begin(@0xA);
    leaderboard::init_for_test(scenario.ctx());
    scenario.next_tx(@0xA);

    let mut board = scenario.take_shared<Leaderboard>();
    board.submit_score(utf8(b"ana"), 50, scenario.ctx());
    scenario.next_tx(@0xB);
    board.submit_score(utf8(b"ben"), 90, scenario.ctx());
    scenario.next_tx(@0xC);
    board.submit_score(utf8(b"cya"), 70, scenario.ctx());

    let entries = board.entries();
    assert!(entries.length() == 3);
    assert!(leaderboard::entry_score(&entries[0]) == 90);
    assert!(leaderboard::entry_score(&entries[1]) == 70);
    assert!(leaderboard::entry_score(&entries[2]) == 50);
    assert!(board.best_score() == 90);

    test_scenario::return_shared(board);
    scenario.end();
}

#[test]
fun only_best_score_per_player() {
    let mut scenario = test_scenario::begin(@0xA);
    leaderboard::init_for_test(scenario.ctx());
    scenario.next_tx(@0xA);

    let mut board = scenario.take_shared<Leaderboard>();
    board.submit_score(utf8(b"ana"), 40, scenario.ctx());
    board.submit_score(utf8(b"ana"), 30, scenario.ctx());
    assert!(board.entries().length() == 1);
    assert!(leaderboard::entry_score(&board.entries()[0]) == 40);

    board.submit_score(utf8(b"ana"), 80, scenario.ctx());
    assert!(board.entries().length() == 1);
    assert!(leaderboard::entry_score(&board.entries()[0]) == 80);

    test_scenario::return_shared(board);
    scenario.end();
}

#[test]
fun low_scores_drop_off() {
    let players = vector[
        @0x1, @0x2, @0x3, @0x4, @0x5, @0x6,
        @0x7, @0x8, @0x9, @0xA, @0xB, @0xC,
    ];
    let mut scenario = test_scenario::begin(@0xA);
    leaderboard::init_for_test(scenario.ctx());
    scenario.next_tx(@0xA);

    let mut board = scenario.take_shared<Leaderboard>();
    let mut i = 0;
    while (i < 12) {
        scenario.next_tx(players[i]);
        board.submit_score(utf8(b"p"), 10 + i, scenario.ctx());
        i = i + 1;
    };
    assert!(board.entries().length() == 10);
    assert!(leaderboard::entry_score(&board.entries()[9]) == 12);

    test_scenario::return_shared(board);
    scenario.end();
}

#[test, expected_failure(abort_code = 1)]
fun long_names_rejected() {
    let mut scenario = test_scenario::begin(@0xA);
    leaderboard::init_for_test(scenario.ctx());
    scenario.next_tx(@0xA);

    let mut board = scenario.take_shared<Leaderboard>();
    board.submit_score(utf8(b"this name is definitely too long"), 10, scenario.ctx());

    test_scenario::return_shared(board);
    scenario.end();
}
