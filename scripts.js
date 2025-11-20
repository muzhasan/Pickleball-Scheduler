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
            if (playerNames[i-1]) input.value = playerNames[i-1];
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
    let indices = Array.from({length: k}, (_, i) => i);

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
 * CORE SCHEDULING LOGIC
 * -----------------------------------------------------------------
 */

/**
 * Compute score: lower is better.
 */
function schedule_score(schedule, num_players) {
    let partners = {}; 
    let sit_counts = {}; 
    let opponents = {}; // who each player has faced
    let repeat_penalty = 0;

    for (let p = 1; p <= num_players; p++) {
        partners[p] = new Set();
        opponents[p] = new Set();
        sit_counts[p] = 0;
    }

    // To detect close succession repeats
    let last_round_opponents = {};

    for (let r = 0; r < schedule.length; r++) {
        const rnd = schedule[r];
        const current_round_opponents = {};

        for (const [t1, t2] of rnd.matches) {
            // t1 and t2 are arrays [a,b] and [c,d]
            const [a, b] = t1;
            const [c, d] = t2;

            // partner repeat penalty (teammates)
            for (const [x, y] of [t1, t2]) {
                if (partners[x].has(y)) {
                    repeat_penalty += 100; // HIGHEST PRIORITY: strict penalty for repeat partners
                }
                partners[x].add(y);
                partners[y].add(x);
            }

            // opponents repeats and close succession
            const pairs = [[a, c], [a, d], [b, c], [b, d]];
            for (const [p, opp] of pairs) {
                if (opponents[p].has(opp)) {
                    repeat_penalty += 15; // stricter: penalty for repeating opponent
                }
                if (last_round_opponents[p] && last_round_opponents[p].has(opp)) {
                    repeat_penalty += 50; // very strict: heavy penalty for facing same opponent in consecutive rounds
                }
                // record current round opponents
                current_round_opponents[p] = current_round_opponents[p] || new Set();
                current_round_opponents[p].add(opp);
            }

            // also record opponents for the other side
            const pairs2 = [[c, a], [c, b], [d, a], [d, b]];
            for (const [p, opp] of pairs2) {
                current_round_opponents[p] = current_round_opponents[p] || new Set();
                current_round_opponents[p].add(opp);
            }
        }

        // update global opponents and sit counts
        for (const pKey in current_round_opponents) {
            const p = Number(pKey);
            for (const opp of current_round_opponents[pKey]) {
                opponents[p].add(opp);
            }
        }

        for (const s of rnd.sitting_out) {
            sit_counts[s] = (sit_counts[s] || 0) + 1;
        }

        // set last_round_opponents for next iteration
        last_round_opponents = current_round_opponents;
    }

    /**
     * Fairness penalty for uneven sit-outs.
     */
    const total_sits = Object.values(sit_counts).reduce((a, b) => a + b, 0);
    const avg_sit = total_sits / num_players;
    let fairness_penalty = 0;
    
    for (let p = 1; p <= num_players; p++) {
        const sits = sit_counts[p] || 0;
        fairness_penalty += (sits - avg_sit) ** 2;
    }

    /**
     * Fairness penalty for uneven opponent distribution.
     * Count how many times each player-pair has met and penalize uneven distribution.
     */
    let pair_meetings = {}; // key: "p1,p2" (sorted), value: count
    for (let p = 1; p <= num_players; p++) {
        for (const opp of opponents[p]) {
            const key = [p, opp].sort().join(',');
            pair_meetings[key] = (pair_meetings[key] || 0) + 1;
        }
    }

    // Calculate average meetings per pair (should be low, ideally 0 or 1)
    const pair_count = Object.keys(pair_meetings).length;
    const total_meetings = Object.values(pair_meetings).reduce((a, b) => a + b, 0);
    const avg_meetings = pair_count > 0 ? total_meetings / pair_count : 0;

    let opponent_fairness = 0;
    for (const count of Object.values(pair_meetings)) {
        opponent_fairness += (count - avg_meetings) ** 2;
    }

    return repeat_penalty + 0.5 * fairness_penalty + 2.0 * opponent_fairness;
}

/**
 * Generate the schedule using randomised search.
 */
function generate_schedule(num_players, num_courts, num_rounds, max_attempts = 2000) {
    let players = Array.from({length: num_players}, (_, i) => i + 1);
    const matches_per_round = Math.min(num_courts, Math.floor(num_players / 4));
    const sitting_per_round = num_players - 4 * matches_per_round;
    const total_sit_slots = sitting_per_round * num_rounds;
    
    let best_schedule = null;
    let best_score = Infinity;

    for (let attempt = 0; attempt < max_attempts; attempt++) {
        shuffle(players); // Shuffle master list for this attempt
        let partners = {};
        let sit_counts = {};
        for (const p of players) {
            partners[p] = new Set();
            sit_counts[p] = 0;
        }
        // Initialize opponents tracking for this attempt (who each player has faced)
        this.opponents = {};
        for (const p of players) {
            this.opponents[p] = new Set();
        }
        let schedule = [];
        let valid = true;

        for (let rnd = 0; rnd < num_rounds && valid; rnd++) {
            // First, determine who sits out this round
            let sitting_out = [];
            if (sitting_per_round > 0) {
                // Get players who sat out in the previous round (to avoid consecutive sit-outs)
                const last_sitting_out = rnd > 0 ? schedule[rnd - 1].sitting_out : [];
                
                // Get players who haven't sat yet
                let never_sat = players.filter(p => sit_counts[p] === 0 && !last_sitting_out.includes(p));
                
                if (never_sat.length > 0) {
                    // Prioritize never-sat players first (excluding those who just sat)
                    shuffle(never_sat);
                    for (const p of never_sat) {
                        if (sitting_out.length >= sitting_per_round) break;
                        sitting_out.push(p);
                    }
                }
                
                // If we need more sitters after using never-sat players
                if (sitting_out.length < sitting_per_round) {
                    // Get players with minimum sit count, excluding those who just sat
                    const min_sits = Math.min(...Object.values(sit_counts));
                    let min_sit_players = players
                        .filter(p => !sitting_out.includes(p) && sit_counts[p] === min_sits && !last_sitting_out.includes(p));
                    
                    shuffle(min_sit_players);
                    for (const p of min_sit_players) {
                        if (sitting_out.length >= sitting_per_round) break;
                        sitting_out.push(p);
                    }
                    
                    // If we still need more, take next level (excluding those who just sat)
                    if (sitting_out.length < sitting_per_round) {
                        let remaining = players
                            .filter(p => !sitting_out.includes(p) && !last_sitting_out.includes(p))
                            .sort((a, b) => sit_counts[a] - sit_counts[b]);
                        
                        for (const p of remaining) {
                            if (sitting_out.length >= sitting_per_round) break;
                            sitting_out.push(p);
                        }
                    }
                    
                    // Last resort: allow players who just sat if we absolutely need them
                    if (sitting_out.length < sitting_per_round) {
                        let last_resort = last_sitting_out.filter(p => !sitting_out.includes(p));
                        shuffle(last_resort);
                        for (const p of last_resort) {
                            if (sitting_out.length >= sitting_per_round) break;
                            sitting_out.push(p);
                        }
                    }
                }
            }
            
            // Update sit counts
            for (const p of sitting_out) {
                sit_counts[p]++;
            }
            
            // Get available players for matches (everyone not sitting)
            let available = players.filter(p => !sitting_out.includes(p));
            shuffle(available);
            let round_matches = [];

            for (let m = 0; m < matches_per_round; m++) {
                if (available.length < 4) {
                    break;
                }
                
                let found = false;
                // Build an opponents map to avoid repeating opponents and recent opponents
                // opponents[player] = Set of players they've faced
                if (!('opponents' in this)) this.opponents = {};
                // initialize opponents map for this attempt
                for (const p of players) {
                    if (!this.opponents[p]) this.opponents[p] = new Set();
                }

                // helper: get last-round opponents for close-succession avoidance
                const last_round_opponents = (rnd > 0 && schedule[rnd - 1]) ? (() => {
                    const m = schedule[rnd - 1].matches || [];
                    const map = {};
                    for (const match of m) {
                        const [t1, t2] = match;
                        const [a, b] = t1; const [c, d] = t2;
                        // a faced c,d
                        map[a] = map[a] || new Set(); map[a].add(c); map[a].add(d);
                        map[b] = map[b] || new Set(); map[b].add(c); map[b].add(d);
                        map[c] = map[c] || new Set(); map[c].add(a); map[c].add(b);
                        map[d] = map[d] || new Set(); map[d].add(a); map[d].add(b);
                    }
                    return map;
                })() : {};

                for (const group of combinations(available, 4)) {
                    const [a, b, c, d] = group;
                    const pairings = [ [[a, b], [c, d]], [[a, c], [b, d]], [[a, d], [b, c]] ];

                    // Evaluate pairings and choose the best (least opponent-repeat penalties)
                    let bestPair = null;
                    let bestScore = Infinity;

                    for (const [t1, t2] of pairings) {
                        // don't allow repeat partners (teammates) as before
                        if (partners[t1[0]].has(t1[1]) || partners[t2[0]].has(t2[1])) {
                            continue;
                        }

                        // compute penalty: opponent repeats and recent repeats are penalized
                        let penalty = 0;
                        const team1 = t1; const team2 = t2;
                        
                        // Check for potential repeat partnerships (both directions)
                        let hasPartnershipRisk = false;
                        for (const p1 of team1) {
                            for (const p2 of team1) {
                                if (p1 < p2) {
                                    // potential partnership within team1 - check if they've played together before
                                    // (Note: we already blocked via partners set, but we want to penalize near-misses)
                                }
                            }
                        }
                        for (const p1 of team2) {
                            for (const p2 of team2) {
                                if (p1 < p2) {
                                    // potential partnership within team2
                                }
                            }
                        }

                        for (const p1 of team1) {
                            for (const p2 of team2) {
                                if (this.opponents[p1] && this.opponents[p1].has(p2)) penalty += 15; // stricter: previous-opponent repeat
                                if (last_round_opponents[p1] && last_round_opponents[p1].has(p2)) penalty += 50; // very strict: close succession heavily penalize
                            }
                        }
                        for (const p1 of team2) {
                            for (const p2 of team1) {
                                if (this.opponents[p1] && this.opponents[p1].has(p2)) penalty += 3;
                                if (last_round_opponents[p1] && last_round_opponents[p1].has(p2)) penalty += 10;
                            }
                        }

                        // small random tie-breaker to vary solutions
                        penalty += Math.random() * 0.1;

                        if (penalty < bestScore) {
                            bestScore = penalty;
                            bestPair = [t1, t2];
                        }
                    }

                    if (bestPair) {
                        // accept best pairing for this group
                        const [t1, t2] = bestPair;
                        round_matches.push([t1, t2]);
                        for (const [x, y] of [t1, t2]) {
                            partners[x].add(y);
                            partners[y].add(x);
                        }
                        // update opponents map
                        const [a1, a2] = t1; const [b1, b2] = t2;
                        this.opponents[a1].add(b1); this.opponents[a1].add(b2);
                        this.opponents[a2].add(b1); this.opponents[a2].add(b2);
                        this.opponents[b1].add(a1); this.opponents[b1].add(a2);
                        this.opponents[b2].add(a1); this.opponents[b2].add(a2);

                        available = available.filter(p => !group.includes(p));
                        found = true;
                    }

                    if (found) break;
                }

                if (!found && available.length >= 4) {
                    // Fallback: just take the first 4
                    const group = available.splice(0, 4); // splice modifies 'available' in place
                    const [a, b, c, d] = group;
                    const t1 = [a, b];
                    const t2 = [c, d];
                    round_matches.push([t1, t2]);
                    for (const [x, y] of [t1, t2]) {
                        partners[x].add(y);
                        partners[y].add(x);
                    }
                }
            } // end matches_per_round loop

            schedule.push({
                "round": rnd + 1,
                "matches": round_matches,
                "sitting_out": sitting_out
            });

            // Validate sit distribution after each round
            const max_sits = Math.max(...Object.values(sit_counts));
            const min_sits = Math.min(...Object.values(sit_counts));
            if (max_sits > min_sits + 1) {
                // Don't allow any player to sit more than once until everyone has sat
                // or more than twice until everyone has sat twice, etc.
                valid = false;
                break;
            }
        } // end num_rounds loop

        if (!valid) continue; // Skip scoring, try next attempt

        const score = schedule_score(schedule, num_players);
        if (score < best_score) {
            best_schedule = schedule;
            best_score = score;
        }
        
        // If we find a perfect score, no need to keep trying
        if (best_score === 0) {
            break;
        }
    } // end max_attempts loop

    return best_schedule;
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
    html.push("<table>");

    // Header row
    let header = ["Round"];
    for (let i = 0; i < max_courts; i++) {
        header.push(`Court ${i+1}`);
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
        
        // Sitting out - check for repeats
        const roundNum = rnd.round;
        const sitters = rnd.sitting_out;
                const sitting = sitters.length > 0 ? sitters.map(getName).join(", ") : "";
        
        let hasRepeatSitter = false;
        let repeatSitInfo = [];
                sitters.forEach(p => {
                    const sits = sitouts.get(p);
                    if (sits && sits.length > 1) {
                        hasRepeatSitter = true;
                        repeatSitInfo.push(`${getName(p)}: rounds ${sits.join(', ')}`);
                    }
                });
        
        if (hasRepeatSitter) {
            const tooltip = `Repeat sit-outs:\n${repeatSitInfo.join('\n')}`;
            row_html.push(`<td class="repeat-sitout">${sitting}<span class="highlight-tooltip">${tooltip}</span></td>`);
        } else {
            row_html.push(`<td>${sitting}</td>`);
        }
        
        html.push("<tr>" + row_html.join("") + "</tr>");
    }

    html.push("</table>");
    container.innerHTML = html.join("\n");
    
    // Show print button when we have a schedule
    const printBtn = document.getElementById('print_btn');
    printBtn.style.display = 'inline-block';
    
    // Create a clean version for printing
    const printArea = document.getElementById('print-area');
    const date = new Date().toLocaleDateString();
    const headerText = `
        <div style="text-align:center; margin-bottom: 20px;">
            <h1 style="margin-bottom: 10px">Pickleball Schedule - ${date}</h2>
        </div>
    `;
    
    // Clone the table to preserve all classes and formatting
    const tableClone = container.querySelector('table').cloneNode(true);
    printArea.innerHTML = ''; // Clear previous content
    printArea.innerHTML = headerText;
    printArea.appendChild(tableClone);
}

// Print button handler
document.getElementById('print_btn').addEventListener('click', () => {
    window.print();
});

}); // Close DOMContentLoaded event listener