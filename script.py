import sys

# Stability scores dictionary
scores = {"nvidia": 95, "walmart": 55, "visa": 85}

# Get slug from command-line arguments
if len(sys.argv) > 1:
    slug = sys.argv[1].lower()  # Convert to lowercase for consistency

    if slug in scores:
        print(f"{slug.capitalize()}: {scores[slug]}")
    else:
        print(f"Error: No data found for '{slug}'")
else:
    print("Error: No slug provided")
