import math

def generate_cookie_path(size=140, sides=12, min_r=0.92, max_r=1.0, power=1.5):
    points = []
    steps = 360
    for i in range(steps + 1):
        angle = math.radians(i)
        
        base = (math.cos(angle * sides) + 1) / 2
        shaped = base ** power
        r = min_r + (max_r - min_r) * shaped
        
        # Scale to 0..size
        px = (size / 2) + (size / 2) * r * math.sin(angle)
        py = (size / 2) - (size / 2) * r * math.cos(angle)
        
        points.append(f"{px:.2f} {py:.2f}")
        
    path_str = f"M {points[0]} " + " ".join([f"L {p}" for p in points[1:]]) + " Z"
    print(path_str)

generate_cookie_path()
