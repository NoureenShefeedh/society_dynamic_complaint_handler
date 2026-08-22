"""
Generates a labeled training dataset of complaint descriptions with a
severity score (1-10), since we have no real historical complaint data
to train on. Combines urgency-signal phrases with category context to
produce realistic, varied examples.

Run once to produce data/labeled_complaints.csv, then train.py uses it.
"""
import csv
import random

random.seed(42)

# (description template, severity score)
# Severity roughly maps to: 1-3 cosmetic/minor, 4-6 moderate/inconvenience,
# 7-8 urgent/safety-adjacent, 9-10 emergency/hazardous
HIGH_SEVERITY = [
    ("There is a gas smell coming from the kitchen, it's getting stronger", 10),
    ("Electrical wires are sparking near the meter box", 10),
    ("Water is flooding into the flat from the ceiling", 9),
    ("The elevator is stuck between floors with people inside", 10),
    ("Fire alarm is going off and there is smoke in the corridor", 10),
    ("A live wire is hanging exposed near the parking area", 9),
    ("There has been a break-in attempt on my door last night", 9),
    ("No water supply in the entire building since morning", 8),
    ("Main gate lock is broken, anyone can walk in", 8),
    ("Ceiling in the bathroom is collapsing, plaster falling", 9),
    ("Strong burning smell from the electrical panel", 9),
    ("Sewage is backing up into the ground floor flats", 8),
    ("Balcony railing is loose and about to fall off", 8),
    ("Power supply keeps short circuiting and sparking", 9),
    ("Gas cylinder is leaking in the common kitchen area", 10),
    ("Staircase railing is completely broken, unsafe to use", 7),
    ("Security guard found an unknown person loitering with a weapon", 9),
    ("Water tank overflow is flooding the terrace and leaking down", 7),
    ("Children's play area has broken glass scattered around", 7),
    ("Lift cable is making a loud snapping noise during use", 9),
    ("I got an electric shock touching the switchboard", 10),
    ("Getting shocks from the switch board near the kitchen", 10),
    ("My child got a mild shock from the wall socket", 10),
    ("Electrocution risk from the exposed switch board wiring", 10),
    ("Touching the metal railing gives an electric shock", 9),
    ("Washing machine gives a shock when plugged in", 9),
    ("Switch board sparked and gave me a shock", 10),
]

MEDIUM_SEVERITY = [
    ("Kitchen tap has been leaking continuously for two days", 5),
    ("No hot water in my flat since yesterday", 5),
    ("Common area lights are not working on my floor", 4),
    ("Intercom system is not working, can't contact security", 5),
    ("Parking gate is jammed and takes forever to open", 4),
    ("Washroom drain is clogged and water is not draining", 5),
    ("AC unit is leaking water onto the wall", 4),
    ("Garbage has not been collected for three days", 5),
    ("Lift button panel is not responding properly", 5),
    ("Water pressure is very low on the top floors", 4),
    ("Main door lock of the building is sticking, hard to open", 4),
    ("Corridor light flickers constantly and needs replacement", 3),
    ("Plumbing pipe is making loud banging noise", 5),
    ("Society Wi-Fi in common area has stopped working", 3),
    ("CCTV camera near the entrance is not functioning", 6),
    ("Stray dogs are entering the compound and barking at night", 4),
    ("Fire extinguisher near my floor looks expired", 6),
    ("Gym equipment is broken and unsafe to use", 4),
    ("Water cooler in the lobby is not cooling properly", 3),
    ("Society board notice board glass is cracked", 3),
]

LOW_SEVERITY = [
    ("Paint on the corridor wall is peeling near my door", 2),
    ("Garden area needs some trimming, plants are overgrown", 2),
    ("Small crack in the tile near the entrance step", 2),
    ("Nameplate outside my flat needs repainting", 1),
    ("Common area needs a fresh coat of paint", 2),
    ("Bench in the garden is a bit wobbly", 2),
    ("Door hinge in the lobby squeaks loudly", 2),
    ("Some tiles in the parking area are chipped", 3),
    ("The bulletin board notices are outdated", 1),
    ("Flower pots in the lobby need replacing", 1),
    ("Wall near the mailbox has minor dampness stains", 3),
    ("The society sign board font is faded and hard to read", 1),
    ("Compound wall has some minor cracks, cosmetic only", 3),
    ("Elevator mirror has a small scratch", 1),
    ("Garden fountain has stopped running, purely decorative", 2),
    ("Paver blocks near the entrance are slightly uneven", 2),
    ("Old furniture in the common hall looks worn out", 2),
    ("Wall clock in the lobby stopped working", 1),
    ("Curtains in the community hall are torn at the edge", 2),
    ("Signboard for visitor parking has faded lettering", 1),
]

PREFIXES = ["", "Urgent: ", "Please look into this - ", "Reporting that ", "Complaint: ", "FYI, "]
SUFFIXES = ["", " Please fix soon.", " This needs immediate attention.", " Requesting a quick fix.", " Not urgent but should be addressed."]

def expand(base_list, n_variants=3):
    rows = []
    for text, score in base_list:
        rows.append((text, score))
        for _ in range(n_variants):
            prefix = random.choice(PREFIXES)
            suffix = random.choice(SUFFIXES) if score < 7 else ""  # urgent ones stay terse
            variant = f"{prefix}{text}{suffix}".strip()
            rows.append((variant, score))
    return rows

all_rows = expand(HIGH_SEVERITY) + expand(MEDIUM_SEVERITY) + expand(LOW_SEVERITY)
random.shuffle(all_rows)

with open("data/labeled_complaints.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["description", "severity_score"])
    writer.writerows(all_rows)

print(f"Generated {len(all_rows)} labeled examples -> data/labeled_complaints.csv")
