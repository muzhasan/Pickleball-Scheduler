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
 * 
 * Scoring criteria:
 * 1. HIGHEST PRIORITY: Penalize repeat partnerships (same teammates)
 * 2. Penalize repeat interactions (different teammates/opponents combinations)
 * 3. Penalize consecutive sit-outs for the same player
 * 4. Penalize uneven sit-out distribution
 * 5. Bonus: Ensure all players have played with/against each other at least once
 */
function schedule_score(schedule, num_players) {
    let partnerships = {}; // key: "p1,p2" (sorted), count of times they've been teammates
    let interactions = {}; // key: "p1,p2" (sorted), count of times they've been in same match
    let sit_counts = {};
    let all_opponents = {}; // who each player has played with or against
    let consecutive_sitouts = 0;
    let repeat_partnership_penalty = 0;
    let repeat_interaction_penalty = 0;
    let last_sitting_out = {};

    for (let p = 1; p <= num_players; p++) {
        all_opponents[p] = new Set();
        sit_counts[p] = 0;
        last_sitting_out[p] = -999; // track when they last sat out
    }

    // Process each round
    for (let r = 0; r < schedule.length; r++) {
        const rnd = schedule[r];

        for (const [t1, t2] of rnd.matches) {
            const [a1, a2] = t1;
            const [b1, b2] = t2;

            // Track partnerships (teammates) - HIGHEST PRIORITY
            const partnership_pairs = [[a1, a2], [b1, b2]];
            for (const [p1, p2] of partnership_pairs) {
                const key = [p1, p2].sort().join(',');
                partnerships[key] = (partnerships[key] || 0) + 1;
                if (partnerships[key] > 1) {
                    repeat_partnership_penalty += 5000; // EXTREMELY HIGH PENALTY for repeat partnerships
                }
            }

            // Track all interactions in this match (all pairs that are in the same match together)
            const all_pairs_in_match = [
                [a1, a2], // teammates
                [b1, b2], // teammates
                [a1, b1], // opponents
                [a1, b2], // opponents
                [a2, b1], // opponents
                [a2, b2]  // opponents
            ];

            for (const [p1, p2] of all_pairs_in_match) {
                const key = [p1, p2].sort().join(',');
                interactions[key] = (interactions[key] || 0) + 1;
                
                // Apply exponential penalty for multiple interactions (but less than partnerships)

                // 1st interaction: 0, 2nd: heavy penalty, 3rd: larger, etc.
                if (interactions[key] > 1) {
                    repeat_interaction_penalty += 1000 * (interactions[key] - 1);
                }
            }

            // Track who each player has played with or against
            all_opponents[a1].add(a2); all_opponents[a1].add(b1); all_opponents[a1].add(b2);
            all_opponents[a2].add(a1); all_opponents[a2].add(b1); all_opponents[a2].add(b2);
            all_opponents[b1].add(a1); all_opponents[b1].add(a2); all_opponents[b2].add(a1); all_opponents[b2].add(a2);
        }

        // Check for consecutive sit-outs
        for (const s of rnd.sitting_out) {
            sit_counts[s]++;
            if (r > 0 && schedule[r - 1].sitting_out.includes(s)) {
                consecutive_sitouts += 50; // Penalize consecutive sit-outs
            }
            last_sitting_out[s] = r;
        }
    }

    // Penalty for uneven sit-out distribution (fairness)
    const total_sits = Object.values(sit_counts).reduce((a, b) => a + b, 0);
    const avg_sit = total_sits / num_players;
    let fairness_penalty = 0;
    
    for (let p = 1; p <= num_players; p++) {
        const sits = sit_counts[p] || 0;
        fairness_penalty += (sits - avg_sit) ** 2;
    }

    // Bonus: Count players who haven't played with/against everyone yet
    let incomplete_pairings = 0;
    for (let p = 1; p <= num_players; p++) {
        const potential_opponents = num_players - 1; // All other players
        const missed = potential_opponents - all_opponents[p].size;
        incomplete_pairings += missed;
    }

    // Penalty: If someone has sat out but not everyone has at least once
    let sitout_fairness = 0;
    const num_who_sat = Object.values(sit_counts).filter(x => x > 0).length;
    if (num_who_sat < num_players && total_sits > 0) {
        // Penalize if some have sat and others haven't
        for (let p = 1; p <= num_players; p++) {
            if (sit_counts[p] === 0 && total_sits > 0) {
                sitout_fairness += 100; // Players should sit at least once
            }
        }
    }

    return repeat_interaction_penalty + consecutive_sitouts + 0.5 * fairness_penalty + 0.1 * incomplete_pairings + sitout_fairness;
}

/**
 * Generate the schedule using randomised search.
 * 
 * Rules:
 * 1. No repeat partnerships (same teammates) - strict requirement
 * 2. Can play against same player multiple times at random - allowed
 * 3. Every player should sit out at least once (if there are sit-outs)
 * 4. Avoid consecutive sit-outs for same player
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
        let partnerships = {}; // Track partnerships: key "p1,p2" (sorted), NEVER allow repeats
        let interactions = {}; // Track all interactions: key "p1,p2" (sorted), value: count
        let sit_counts = {};
        for (const p of players) {
            sit_counts[p] = 0;
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

                for (const group of combinations(available, 4)) {
                    const [a, b, c, d] = group;
                    const pairings = [ [[a, b], [c, d]], [[a, c], [b, d]], [[a, d], [b, c]] ];

                    // Evaluate pairings and choose the best
                    let bestPair = null;
                    let bestScore = Infinity;

                    for (const [t1, t2] of pairings) {
                        // STRICT: Do not allow repeat partnerships (same teammates)
                        // This is the HIGHEST priority
                        const key1 = [t1[0], t1[1]].sort().join(',');
                        const key2 = [t2[0], t2[1]].sort().join(',');
                        
                        if ((partnerships[key1] && partnerships[key1] > 0) || (partnerships[key2] && partnerships[key2] > 0)) {
                            continue; // Skip this pairing entirely - partnerships are forbidden to repeat
                        }

                        // Compute penalty for this pairing (only for non-partnership interactions)
                        let penalty = 0;
                        
                        // Penalize if players in same match have played together before (except partnerships)
                        const opponent_pairs_in_match = [
                            [t1[0], t2[0]], // opponents
                            [t1[0], t2[1]], // opponents
                            [t1[1], t2[0]], // opponents
                            [t1[1], t2[1]]  // opponents
                        ];
                        
                        // Compute sum of prior interactions for opponent pairs (lower is better)
                        let sumInteractions = 0;
                        for (const [p1, p2] of opponent_pairs_in_match) {
                            const key = [p1, p2].sort().join(',');
                            if (interactions[key]) sumInteractions += interactions[key];
                        }

                        // Heavily penalize repeats but allow them if unavoidable
                        // penalty scales with number of prior interactions
                        penalty += 2000 * sumInteractions;

                        // Small random tie-breaker to vary solutions
                        penalty += Math.random() * 0.1;

                        if (penalty < bestScore) {
                            bestScore = penalty;
                            bestPair = [t1, t2];
                        }
                    }

                    if (bestPair) {
                        // Accept best pairing for this group
                        const [t1, t2] = bestPair;
                        round_matches.push([t1, t2]);

                        // Track partnerships (HIGH PRIORITY - strictly no repeats)
                        const partnership_pairs = [
                            [t1[0], t1[1]],
                            [t2[0], t2[1]]
                        ];
                        for (const [p1, p2] of partnership_pairs) {
                            const key = [p1, p2].sort().join(',');
                            partnerships[key] = (partnerships[key] || 0) + 1;
                        }

                        // Track all interactions (for optimization purposes)
                        const all_pairs_in_match = [
                            [t1[0], t1[1]], // teammates
                            [t2[0], t2[1]], // teammates
                            [t1[0], t2[0]], // opponents
                            [t1[0], t2[1]], // opponents
                            [t1[1], t2[0]], // opponents
                            [t1[1], t2[1]]  // opponents
                        ];
                        
                        for (const [p1, p2] of all_pairs_in_match) {
                            const key = [p1, p2].sort().join(',');
                            interactions[key] = (interactions[key] || 0) + 1;
                        }

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
                    
                    // Track partnerships
                    const partnership_pairs = [[a, b], [c, d]];
                    for (const [p1, p2] of partnership_pairs) {
                        const key = [p1, p2].sort().join(',');
                        partnerships[key] = (partnerships[key] || 0) + 1;
                    }

                    // Track all interactions
                    const all_pairs_in_match = [
                        [a, b], // teammates
                        [c, d], // teammates
                        [a, c], // opponents
                        [a, d], // opponents
                        [b, c], // opponents
                        [b, d]  // opponents
                    ];
                    
                    for (const [p1, p2] of all_pairs_in_match) {
                        const key = [p1, p2].sort().join(',');
                        interactions[key] = (interactions[key] || 0) + 1;
                    }
                }
            } // end matches_per_round loop

            schedule.push({
                "round": rnd + 1,
                "matches": round_matches,
                "sitting_out": sitting_out
            });

            // Validate sit distribution: ensure no player sits more than once more than any other
            const max_sits = Math.max(...Object.values(sit_counts));
            const min_sits = Math.min(...Object.values(sit_counts));
            if (max_sits > min_sits + 1) {
                valid = false;
                break;
            }
        } // end num_rounds loop

        if (!valid) continue; // Skip scoring, try next attempt

        // CRITICAL VALIDATION: Check for any repeat partnerships in the generated schedule
        let has_repeat_partnership = false;
        let partnership_check = {};
        for (let r = 0; r < schedule.length; r++) {
            const rnd = schedule[r];
            for (const [t1, t2] of rnd.matches) {
                const [a1, a2] = t1;
                const [b1, b2] = t2;
                
                const key1 = [a1, a2].sort().join(',');
                const key2 = [b1, b2].sort().join(',');
                
                if (partnership_check[key1] || partnership_check[key2]) {
                    has_repeat_partnership = true;
                    break;
                }
                partnership_check[key1] = true;
                partnership_check[key2] = true;
            }
            if (has_repeat_partnership) break;
        }
        
        // If we found repeat partnerships, skip this schedule attempt
        if (has_repeat_partnership) {
            continue;
        }

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
    html.push("<div class='schedule-wrapper'>");
    html.push("<button id='toggle-court-edit-btn' class='court-edit-btn'>Edit Court Numbers</button>");
    html.push("<table>");

    // Header row
    let header = ["Round"];
    for (let i = 0; i < max_courts; i++) {
        header.push(`<span class='court-header' data-court='${i+1}'>Court ${i+1}</span>`);
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