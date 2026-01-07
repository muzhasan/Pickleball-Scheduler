/**
 * -----------------------------------------------------------------
 * MAIN EVENT LISTENER
 * -----------------------------------------------------------------
 */
document.addEventListener('DOMContentLoaded', () => {
    // State for player names and last generated schedule
    let playerNames = [];
    let lastSchedule = null;

    document.getElementById('generate_btn').addEventListener('click', () => {
        const num_players = parseInt(document.getElementById('num_players').value);
        const num_courts = parseInt(document.getElementById('num_courts').value);
        const num_rounds = parseInt(document.getElementById('num_rounds').value);

        if (num_players < 4) {
            alert("Need at least 4 players for doubles.");
            return;
        }

        const button = document.getElementById('generate_btn');
        const status = document.getElementById('status');

        button.disabled = true;
        status.textContent = "Generating... (this may take a moment)";

        // Use setTimeout to allow the UI to update before the heavy computation
        setTimeout(() => {
            const schedule = generate_schedule(num_players, num_courts, num_rounds);
            lastSchedule = schedule;
            displaySchedule(schedule);

            button.disabled = false;
            status.textContent = "";
        }, 50); // 50ms delay
    });

    // Player names modal handlers
    const nameModal = document.getElementById('name-modal');
    const nameFields = document.getElementById('name-fields');
    const nameSaveBtn = document.getElementById('name-save-btn');
    const nameCancelBtn = document.getElementById('name-cancel-btn');
    const nameCopyBtn = document.getElementById('name-copy-btn');
    const namePasteBtn = document.getElementById('name-paste-btn');
    const nameOverlay = document.querySelector('#name-modal .modal-overlay');

    document.getElementById('player_names_btn').addEventListener('click', () => {
        const num = parseInt(document.getElementById('num_players').value) || 0;
        nameFields.innerHTML = '';
        for (let i = 1; i <= num; i++) {
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.gap = '8px';
            const label = document.createElement('label');
            label.textContent = i + '.';
            label.style.minWidth = '28px';
            const input = document.createElement('input');
            input.type = 'text';
            input.id = `name-input-${i}`;
            input.placeholder = `Player ${i}`;
            if (playerNames[i - 1]) input.value = playerNames[i - 1];
            wrapper.appendChild(label);
            wrapper.appendChild(input);
            nameFields.appendChild(wrapper);
        }
        nameModal.style.display = 'flex';
        nameModal.setAttribute('aria-hidden', 'false');
    });

    nameSaveBtn.addEventListener('click', () => {
        const num = parseInt(document.getElementById('num_players').value) || 0;
        const newNames = [];
        for (let i = 1; i <= num; i++) {
            const v = document.getElementById(`name-input-${i}`)?.value?.trim() || '';
            newNames.push(v);
        }
        playerNames = newNames;
        nameModal.style.display = 'none';
        nameModal.setAttribute('aria-hidden', 'true');
        if (lastSchedule) displaySchedule(lastSchedule);
    });

    const closeNameModal = () => {
        nameModal.style.display = 'none';
        nameModal.setAttribute('aria-hidden', 'true');
    };

    nameCancelBtn.addEventListener('click', closeNameModal);
    if (nameOverlay) nameOverlay.addEventListener('click', closeNameModal);

    nameCopyBtn.addEventListener('click', () => {
        const num = parseInt(document.getElementById('num_players').value) || 0;
        const names = [];
        for (let i = 1; i <= num; i++) {
            const v = document.getElementById(`name-input-${i}`)?.value?.trim() || '';
            names.push(v);
        }
        const clipboardText = names.join('\n');
        navigator.clipboard.writeText(clipboardText).then(() => {
            alert('Names copied to clipboard');
        }).catch(err => {
            alert('Failed to copy to clipboard');
            console.error(err);
        });
    });

    namePasteBtn.addEventListener('click', () => {
        navigator.clipboard.readText().then(text => {
            const lines = text.split('\n');
            const num = parseInt(document.getElementById('num_players').value) || 0;
            for (let i = 1; i <= num; i++) {
                const input = document.getElementById(`name-input-${i}`);
                if (input) {
                    input.value = lines[i - 1] ? lines[i - 1].trim() : '';
                }
            }
        }).catch(err => {
            alert('Failed to read clipboard');
            console.error(err);
        });
    });

    /**
     * -----------------------------------------------------------------
     * HELPER FUNCTIONS
     * -----------------------------------------------------------------
     */

    /**
     * Shuffles an array in place using the Fisher-Yates algorithm.
     */
    function shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    // Return player's name if provided, otherwise numeric id as string
    function getName(p) {
        if (typeof p !== 'number') return String(p);
        if (playerNames && playerNames[p - 1]) return playerNames[p - 1];
        return String(p);
    }

    /**
     * A generator function that yields all combinations of k elements from an array.
     */
    function* combinations(array, k) {
        if (k > array.length || k <= 0) return;
        let indices = Array.from({ length: k }, (_, i) => i);

        while (true) {
            yield indices.map(i => array[i]);
            let i = k - 1;
            while (i >= 0 && indices[i] === i + array.length - k) {
                i--;
            }
            if (i < 0) {
                break;
            }
            indices[i]++;
            for (let j = i + 1; j < k; j++) {
                indices[j] = indices[j - 1] + 1;
            }
        }
    }

    /**
     * -----------------------------------------------------------------
     * CORE SCHEDULING LOGIC (REWRITTEN)
     * -----------------------------------------------------------------
     */

    class ScheduleTracker {
        constructor(num_players, num_courts) {
            this.num_players = num_players;
            this.num_courts = num_courts;

            // Tracking history
            this.partnerships = new Map(); // "p1,p2" -> count
            this.opponents = new Map();    // "p1,p2" -> count
            this.interactions = new Map(); // "p1,p2" -> count (Partner OR Opponent)
            this.court_counts = Array.from({ length: num_players + 1 }, () => Array(num_courts).fill(0)); // player -> [c1_count, c2_count...]
            this.last_court = Array.from({ length: num_players + 1 }, () => -1); // player -> last court index
            this.sit_counts = Array.from({ length: num_players + 1 }, () => 0);
            this.match_history = []; // Array of rounds
        }

        getPartnershipCount(p1, p2) {
            const key = p1 < p2 ? `${p1},${p2}` : `${p2},${p1}`;
            return this.partnerships.get(key) || 0;
        }

        recordPartnership(p1, p2) {
            const key = p1 < p2 ? `${p1},${p2}` : `${p2},${p1}`;
            this.partnerships.set(key, (this.partnerships.get(key) || 0) + 1);
        }

        getOpponentCount(p1, p2) {
            const key = p1 < p2 ? `${p1},${p2}` : `${p2},${p1}`;
            return this.opponents.get(key) || 0;
        }

        recordOpponent(p1, p2) {
            const key = p1 < p2 ? `${p1},${p2}` : `${p2},${p1}`;
            this.opponents.set(key, (this.opponents.get(key) || 0) + 1);
        }

        getInteractionCount(p1, p2) {
            const key = p1 < p2 ? `${p1},${p2}` : `${p2},${p1}`;
            return this.interactions.get(key) || 0;
        }

        recordInteraction(p1, p2) {
            const key = p1 < p2 ? `${p1},${p2}` : `${p2},${p1}`;
            this.interactions.set(key, (this.interactions.get(key) || 0) + 1);
        }

        recordCourt(player, court_idx) {
            if (this.court_counts[player]) {
                this.court_counts[player][court_idx]++;
                this.last_court[player] = court_idx;
            }
        }
    }

    /**
     * Main entry point for schedule generation
     */
    function generate_schedule(num_players, num_courts, num_rounds) {
        // 1. Setup
        const players = Array.from({ length: num_players }, (_, i) => i + 1);
        const matches_per_round = Math.min(num_courts, Math.floor(num_players / 4));
        const sitters_per_round = num_players - (matches_per_round * 4);

        const tracker = new ScheduleTracker(num_players, matches_per_round);

        // 2. Determine Sit-outs
        // detailed_sit_schedule maps round_index -> array of sitting player IDs
        const sit_schedule = distribute_sit_outs(players, num_rounds, sitters_per_round);

        let full_schedule = [];

        // 3. Generate Rounds
        for (let r = 0; r < num_rounds; r++) {
            const sitting_out = sit_schedule[r] || [];
            const active_players = players.filter(p => !sitting_out.includes(p));

            let valid_round_found = false;
            let best_fallback_round = null;

            // Retry loop to find a round that allows valid court assignment
            for (let attempt = 0; attempt < 50; attempt++) {
                const matches = generate_round_matches(active_players, tracker, matches_per_round);

                if (matches) {
                    const assigned_matches = assign_courts(matches, tracker);

                    // VALIDATE: Did this assignment cause any consecutive court violations?
                    let has_consecutive = false;
                    assigned_matches.forEach((match, c_idx) => {
                        const ps = [match[0][0], match[0][1], match[1][0], match[1][1]];
                        if (ps.some(p => tracker.last_court[p] === c_idx)) {
                            has_consecutive = true;
                        }
                    });

                    if (!has_consecutive) {
                        // Success!
                        update_tracker(tracker, assigned_matches, sitting_out);
                        full_schedule.push({
                            round: r + 1,
                            matches: assigned_matches,
                            sitting_out: sitting_out
                        });
                        valid_round_found = true;
                        break;
                    } else {
                        // Save as fallback if we never find a perfect one
                        if (!best_fallback_round) best_fallback_round = { matches: assigned_matches, sitting: sitting_out };
                    }
                }
            }

            if (!valid_round_found) {
                // Check if we have a fallback from strict generation
                if (best_fallback_round) {
                    console.warn(`Round ${r + 1}: Strict court rotation failed, using best accepted strict match set.`);
                    update_tracker(tracker, best_fallback_round.matches, sitting_out);
                    full_schedule.push({
                        round: r + 1,
                        matches: best_fallback_round.matches,
                        sitting_out: sitting_out
                    });
                } else {
                    // Fallback to purely random if strict generation completely failed
                    console.warn(`Could not find strict matches for round ${r + 1}, trying fallback generator.`);
                    const fallback_matches = generate_round_matches_fallback(active_players, tracker, matches_per_round);
                    // Assign courts for fallback
                    const assigned_fallback = assign_courts(fallback_matches, tracker);
                    update_tracker(tracker, assigned_fallback, sitting_out);
                    full_schedule.push({
                        round: r + 1,
                        matches: assigned_fallback,
                        sitting_out: sitting_out
                    });
                }
            }
        }

        return full_schedule;
    }

    /**
     * Distribute sit-outs evenly and spread them out.
     */
    function distribute_sit_outs(players, num_rounds, sitters_per_round) {
        if (sitters_per_round === 0) return Array.from({ length: num_rounds }, () => []);

        const num_players = players.length;
        const total_sits_needed = sitters_per_round * num_rounds;

        // Calculate base sits per player
        const base_sits = Math.floor(total_sits_needed / num_players);
        const extra_sits = total_sits_needed % num_players;

        // Determine exact number of sits for each player
        let player_sit_counts = {};
        // Shuffle players to randomize who gets the extra sit
        let shuffled_players = [...players];
        shuffle(shuffled_players);

        shuffled_players.forEach((p, idx) => {
            player_sit_counts[p] = base_sits + (idx < extra_sits ? 1 : 0);
        });

        // Allocate sits to rounds avoiding consecutive sits
        let schedule = Array.from({ length: num_rounds }, () => []);
        let player_last_sat = {}; // player -> round_idx
        players.forEach(p => player_last_sat[p] = -999);

        // Minimum gap required
        const min_gap = Math.floor(num_rounds / 3);

        // We fill round by round
        for (let r = 0; r < num_rounds; r++) {
            let needed = sitters_per_round;
            let candidates = [...players].filter(p => player_sit_counts[p] > 0);

            // Shuffle candidates to ensure random tie-breaking
            shuffle(candidates);

            candidates.sort((a, b) => {
                const a_last = player_last_sat[a];
                const b_last = player_last_sat[b];

                // 1. Strict Gap Enforcement (Primary Constraint)
                const a_ok = (r - a_last) >= min_gap;
                const b_ok = (r - b_last) >= min_gap;
                if (a_ok !== b_ok) return a_ok ? -1 : 1;

                // 2. Avoid consecutive sits (Secondary Constraint)
                const a_consecutive = (a_last === r - 1);
                const b_consecutive = (b_last === r - 1);
                if (a_consecutive !== b_consecutive) return a_consecutive ? 1 : -1;

                // 3. Who "needs" to sit more relative to rounds remaining? 
                const a_rem = player_sit_counts[a];
                const b_rem = player_sit_counts[b];
                if (a_rem !== b_rem) return b_rem - a_rem;

                // 4. Random tie-break (handled by initial shuffle + stable sort)
                return 0;
            });

            // If strict constraints allow, great. If not, we still have to pick someone.
            // The sorting above puts the "best" candidates at top.

            const sitters = candidates.slice(0, needed);
            sitters.forEach(p => {
                schedule[r].push(p);
                player_sit_counts[p]--;
                player_last_sat[p] = r;
            });
        }

        return schedule;
    }

    /**
     * Generate matches for a single round using a greedy approach with local optimization.
     */
    function generate_round_matches(active_players, tracker, num_matches) {
        // We need to form 'num_matches' groups of 4.
        // Constraints:
        // 1. NO REPEAT PARTNERS (Hard constraint if possible)
        // 2. MIX OPPONENTS (Soft constraint)
        // 3. COURT BLOCKING (Hard constraint): A group cannot consist of players who collectively block all courts.

        let best_grouping = null;
        let best_score = Infinity; // Lower is better

        // We'll try a few randomized greedy attempts
        // We'll try a few randomized greedy attempts
        const attempts = 1000; // Increased attempts significantly for better mixing

        for (let i = 0; i < attempts; i++) {
            let current_players = [...active_players];
            shuffle(current_players);
            let round_matches = [];
            let possible = true;
            let round_score = 0;

            while (round_matches.length < num_matches) {
                // Take 4 players
                if (current_players.length < 4) {
                    possible = false;
                    break;
                }

                const group = current_players.slice(0, 4);

                // CHECK: Does this group block all courts?
                const blocked_courts = new Set();
                group.forEach(p => {
                    const lc = tracker.last_court[p];
                    if (lc !== -1) blocked_courts.add(lc);
                });

                // We need at least one court that is NOT in blocked_courts.
                // The available courts are 0..tracker.num_courts-1
                // Actually 'tracker.num_courts' tracks total courts.
                let valid_court_exists = false;
                for (let c = 0; c < tracker.num_courts; c++) {
                    if (!blocked_courts.has(c)) {
                        valid_court_exists = true;
                        break;
                    }
                }

                if (!valid_court_exists) {
                    // This group is invalid because they cannot play on any court without repeating.
                    // Since this is a simple greedy approach, we just fail this attempt and try again.
                    // (In a smarter version, we'd swap players, but random shuffle usually finds a way).
                    possible = false;
                    break;
                }

                current_players = current_players.slice(4);

                // Find best pairings within these 4
                // [p1,p2] vs [p3,p4]
                // [p1,p3] vs [p2,p4]
                // [p1,p4] vs [p2,p3]

                const combinations = [
                    [[group[0], group[1]], [group[2], group[3]]],
                    [[group[0], group[2]], [group[1], group[3]]],
                    [[group[0], group[3]], [group[1], group[2]]]
                ];

                let best_combo = null;
                let best_combo_cost = Infinity;

                for (const combo of combinations) {
                    const [t1, t2] = combo;

                    // COST CALCULATION
                    // 1. Partnership repeats (Scale: 10000) - Avoid repeat partners at all costs
                    const p1_cost = tracker.getPartnershipCount(t1[0], t1[1]);
                    const p2_cost = tracker.getPartnershipCount(t2[0], t2[1]);
                    const partner_cost = (p1_cost > 0 ? 10000 * p1_cost : 0) + (p2_cost > 0 ? 10000 * p2_cost : 0);

                    // 2. Interaction Repeats (Scale: 100) - Avoid playing with/against same people
                    const group_players = [t1[0], t1[1], t2[0], t2[1]];
                    let interaction_cost = 0;
                    for (let x = 0; x < 4; x++) {
                        for (let y = x + 1; y < 4; y++) {
                            // For every pair in this match (partner or opponent)
                            const count = tracker.getInteractionCount(group_players[x], group_players[y]);
                            interaction_cost += (count * 100);
                        }
                    }

                    const total_cost = partner_cost + interaction_cost;

                    if (total_cost < best_combo_cost) {
                        best_combo_cost = total_cost;
                        best_combo = combo;
                    }
                }

                if (best_combo) {
                    round_matches.push(best_combo);
                    round_score += best_combo_cost;
                }
            }

            if (possible) {
                // If this attempt is better than global best (or we haven't found one yet)
                // AND ideally it shouldn't have repeat partners (score < 1000)
                if (!best_grouping || round_score < best_score) {
                    best_score = round_score;
                    best_grouping = round_matches;
                }

                // If we found a perfect one, stop early
                if (round_score === 0) break;
            }
        }

        return best_grouping;
    }

    /**
     * Fallback generator if strict constraints make it hard. Just shuffles and pairs.
     */
    function generate_round_matches_fallback(active_players, tracker, num_matches) {
        let players = [...active_players];
        shuffle(players);
        let matches = [];
        for (let i = 0; i < num_matches; i++) {
            if (players.length < 4) break;
            const group = players.splice(0, 4);
            matches.push([[group[0], group[1]], [group[2], group[3]]]);
        }
        return matches;
    }

    /**
     * Assign matches to courts to rotate players.
     */
    function assign_courts(matches, tracker) {
        // We want to assign matches (m1, m2, m3...) to courts (c1, c2, c3...)
        // such that players in m_i haven't played too much on c_i AND have not JUST played on c_i.

        // Since num_courts is small (usually < 8), we can just try all permutations of assignments
        // if num_matches is small.
        // If num_matches <= 6 (6!=720), strict permutation is cheap.
        // If num_matches > 6, maybe fallback to greedy.

        const num_courts = matches.length;

        // Heuristic: If <= 6 courts, do full permutation search for optimal assignment.
        // Else do improved greedy.

        // Helper to calc usage score
        const calcCost = (assignment) => {
            let total_variance = 0;
            let consecutive_penalty = 0;

            assignment.forEach((match, c_idx) => {
                const players = [match[0][0], match[0][1], match[1][0], match[1][1]];
                players.forEach(p => {
                    // 1. Balance Cost
                    const current_count = tracker.court_counts[p] ? tracker.court_counts[p][c_idx] : 0;
                    total_variance += (current_count + 1) ** 2; // preferring lower counts

                    // 2. Consecutive Court Penalty (Strict)
                    if (tracker.last_court[p] === c_idx) {
                        consecutive_penalty += 10000;
                    }
                });
            });
            return total_variance + consecutive_penalty;
        };

        if (num_courts <= 6) {
            let indices = Array.from({ length: num_courts }, (_, i) => i);
            let best_perm = null;
            let best_cost = Infinity;

            const permutations = function* (arr, pos = 0) {
                if (pos === arr.length - 1) {
                    yield arr;
                    return;
                }
                for (let i = pos; i < arr.length; i++) {
                    [arr[pos], arr[i]] = [arr[i], arr[pos]];
                    yield* permutations(arr, pos + 1);
                    [arr[pos], arr[i]] = [arr[i], arr[pos]];
                }
            }

            for (const perm of permutations([...indices])) {
                // perm[i] is the match index assigned to court i
                // construct candidate assignment
                let candidate = new Array(num_courts);
                for (let c = 0; c < num_courts; c++) {
                    candidate[c] = matches[perm[c]];
                }
                const cost = calcCost(candidate);
                if (cost < best_cost) {
                    best_cost = cost;
                    best_perm = candidate;
                }
            }
            return best_perm;
        } else {
            // Greedy approach for many courts (rare in pickleball but possible)
            // Just sort matches by "most needy of non-conflicting court"??
            // Let's stick effectively to original logic but add consecutive check
            let assigned_matches = new Array(num_courts); // index = court index
            let unassigned_matches = [...matches];

            for (let c = 0; c < num_courts; c++) {
                let best_m_idx = -1;
                let min_usage = Infinity;

                unassigned_matches.forEach((match, idx) => {
                    const players = [match[0][0], match[0][1], match[1][0], match[1][1]];
                    let usage = players.reduce((sum, p) => sum + (tracker.court_counts[p] ? tracker.court_counts[p][c] : 0), 0);

                    // Add huge penalty for consecutive
                    const has_consecutive = players.some(p => tracker.last_court[p] === c);
                    if (has_consecutive) usage += 10000;

                    if (usage < min_usage) {
                        min_usage = usage;
                        best_m_idx = idx;
                    }
                });

                if (best_m_idx !== -1) {
                    assigned_matches[c] = unassigned_matches[best_m_idx];
                    unassigned_matches.splice(best_m_idx, 1);
                } else {
                    assigned_matches[c] = unassigned_matches[0];
                    unassigned_matches.splice(0, 1);
                }
            }
            return assigned_matches;
        }
    }

    function update_tracker(tracker, matches, sitting_out) {
        // Matches here are already ordered by court index: match[0] is court 1, etc.
        matches.forEach((match, court_idx) => {
            const [t1, t2] = match;

            // Partnerships
            tracker.recordPartnership(t1[0], t1[1]);
            tracker.recordPartnership(t2[0], t2[1]);

            // Opponents
            // Opponents
            tracker.recordOpponent(t1[0], t2[0]);
            tracker.recordOpponent(t1[0], t2[1]);
            tracker.recordOpponent(t1[1], t2[0]);
            tracker.recordOpponent(t1[1], t2[1]);

            // Interaction (Global Mixing)
            const group = [t1[0], t1[1], t2[0], t2[1]];
            for (let i = 0; i < 4; i++) {
                for (let j = i + 1; j < 4; j++) {
                    tracker.recordInteraction(group[i], group[j]);
                }
            }

            // Court Usage
            const players = [t1[0], t1[1], t2[0], t2[1]];
            players.forEach(p => tracker.recordCourt(p, court_idx));
        });

        // Sit counts handled by distribute function, but we can track if needed
    }

    /**
     * Renders the schedule as an HTML table with highlighting for repeats.
     */
    function displaySchedule(schedule) {
        const container = document.getElementById('schedule-container');
        if (!schedule) {
            container.innerHTML = "<p>Could not generate a valid schedule.</p>";
            return;
        }

        // Track partnerships and sit-outs
        const partnerships = new Map(); // key: "player1,player2", value: [round numbers]
        const sitouts = new Map();      // key: player, value: [round numbers]

        // First pass: collect all partnerships and sit-outs
        schedule.forEach((rnd, idx) => {
            const round = idx + 1;
            // Track partnerships
            rnd.matches.forEach(([t1, t2]) => {
                const pairs = [[t1[0], t1[1]], [t2[0], t2[1]]];
                pairs.forEach(([p1, p2]) => {
                    const key = [p1, p2].sort().join(',');
                    if (!partnerships.has(key)) partnerships.set(key, []);
                    partnerships.get(key).push(round);
                });
            });
            // Track sit-outs
            rnd.sitting_out.forEach(player => {
                if (!sitouts.has(player)) sitouts.set(player, []);
                sitouts.get(player).push(round);
            });
        });

        const max_courts = Math.max(...schedule.map(rnd => rnd.matches.length));
        let html = [];
        html.push("<div class='schedule-wrapper'>");
        html.push("<button id='toggle-court-edit-btn' class='court-edit-btn'>Edit Court Numbers</button>");
        html.push("<table>");

        // Header row
        let header = ["Round"];
        for (let i = 0; i < max_courts; i++) {
            header.push(`<span class='court-header' data-court='${i + 1}'>Court ${i + 1}</span>`);
        }
        header.push("Sitting Out");
        html.push("<tr>" + header.map(h => `<th>${h}</th>`).join("") + "</tr>");

        // Table rows
        for (const rnd of schedule) {
            let row_html = [`<td>${rnd.round}</td>`];

            // Matches
            for (const match of rnd.matches) {
                const [t1, t2] = match;
                // Check for repeat partnerships in this match
                const pairs = [[t1[0], t1[1]], [t2[0], t2[1]]];
                let hasRepeat = false;
                let repeatInfo = [];

                pairs.forEach(([p1, p2]) => {
                    const key = [p1, p2].sort().join(',');
                    const occurrences = partnerships.get(key);
                    if (occurrences && occurrences.length > 1) {
                        hasRepeat = true;
                        repeatInfo.push(`${getName(p1)} - ${getName(p2)}: rounds ${occurrences.join(', ')}`);
                    }
                });

                const cellContent = `${getName(t1[0])}, ${getName(t1[1])}</br>vs</br> ${getName(t2[0])}, ${getName(t2[1])}`;
                if (hasRepeat) {
                    const tooltip = `Repeat partnerships:\n${repeatInfo.join('\n')}`;
                    row_html.push(`<td class="repeat-partnership">${cellContent}<span class="highlight-tooltip">${tooltip}</span></td>`);
                } else {
                    row_html.push(`<td>${cellContent}</td>`);
                }
            }

            // Fill empty cells
            while (row_html.length < max_courts + 1) {
                row_html.push("<td>—</td>");
            }

            // Sitting out - append count in brackets if sitting out more than once
            const roundNum = rnd.round;
            const sitters = rnd.sitting_out;
            const sitting = sitters.length > 0 ? sitters.map(p => {
                const sits = sitouts.get(p);
                const sitCount = sits ? sits.length : 0;
                const name = getName(p);
                return sitCount > 1 ? `${name} [${sitCount}]` : name;
            }).join(", ") : "";

            row_html.push(`<td>${sitting}</td>`);

            html.push("<tr>" + row_html.join("") + "</tr>");
        }

        html.push("</table>");
        html.push("</div>");
        container.innerHTML = html.join("\n");

        // Add event listeners for court number editing
        const toggleBtn = document.getElementById('toggle-court-edit-btn');
        toggleBtn.addEventListener('click', () => {
            toggleCourtEdit(toggleBtn, max_courts);
        });

        // Show print button when we have a schedule
        const printBtn = document.getElementById('print_btn');
        printBtn.style.display = 'inline-block';

        // Update print area function
        const updatePrintArea = () => {
            const printArea = document.getElementById('print-area');
            const date = new Date().toLocaleDateString();
            const headerText = `
            <div style="text-align:center; margin-bottom: 20px;">
                <h1 style="margin-bottom: 10px">Pickleball Schedule - ${date}</h2>
            </div>
        `;

            // Clone the table to preserve all classes and formatting
            const tableClone = container.querySelector('table').cloneNode(true);

            // Convert any input fields to text (in case we're in edit mode)
            const inputs = tableClone.querySelectorAll('input.court-number-input');
            inputs.forEach((input, idx) => {
                const span = document.createElement('span');
                span.className = 'court-header';
                span.textContent = `Court ${input.value || (idx + 1)}`;
                input.replaceWith(span);
            });

            printArea.innerHTML = ''; // Clear previous content
            printArea.innerHTML = headerText;
            printArea.appendChild(tableClone);
        };

        // Create initial print area
        updatePrintArea();

        // Update print area when toggle button is clicked
        const originalToggleListener = toggleBtn.onclick;
        toggleBtn.addEventListener('click', () => {
            // Update print area after a short delay to ensure DOM is updated
            setTimeout(updatePrintArea, 50);
        });
    }

    function toggleCourtEdit(button, max_courts) {
        const table = document.querySelector('.schedule-wrapper table');
        const headers = table.querySelectorAll('th .court-header');
        const isEditing = button.classList.contains('editing');

        if (!isEditing) {
            // Enter edit mode
            button.classList.add('editing');
            button.textContent = 'Done Editing';

            headers.forEach(header => {
                const currentCourt = header.getAttribute('data-court');
                const currentText = header.textContent;

                const input = document.createElement('input');
                input.type = 'number';
                input.className = 'court-number-input';
                input.value = currentCourt;
                input.min = '1';

                header.replaceWith(input);
            });
        } else {
            // Exit edit mode
            button.classList.remove('editing');
            button.textContent = 'Edit Court Numbers';

            const inputs = table.querySelectorAll('th input.court-number-input');
            inputs.forEach((input, idx) => {
                const courtNum = input.value || (idx + 1);

                const span = document.createElement('span');
                span.className = 'court-header';
                span.setAttribute('data-court', courtNum);
                span.textContent = `Court ${courtNum}`;

                input.replaceWith(span);
            });

            // Update print area after exiting edit mode
            const container = document.getElementById('schedule-container');
            const printArea = document.getElementById('print-area');
            const date = new Date().toLocaleDateString();
            const headerText = `
            <div style="text-align:center; margin-bottom: 20px;">
                <h1 style="margin-bottom: 10px">Pickleball Schedule - ${date}</h2>
            </div>
        `;

            const tableClone = container.querySelector('table').cloneNode(true);
            printArea.innerHTML = headerText;
            printArea.appendChild(tableClone);
        }
    }

    // Print button handler
    document.getElementById('print_btn').addEventListener('click', () => {
        window.print();
    });

}); // Close DOMContentLoaded event listener