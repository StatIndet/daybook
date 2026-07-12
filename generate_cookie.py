import math

def generate_cookie_path(sides=12, min_r=0.94, max_r=1.0, power=1.5):
    points = []
    steps = 360
    for i in range(steps + 1):
        angle = math.radians(i)
        
        # Base wave from 0 to 1
        base = (math.cos(angle * sides) + 1) / 2
        
        # Scallop shaping
        shaped = base ** power
        
        # Map to min_r .. max_r
        r = min_r + (max_r - min_r) * shaped
        
        # Scale to 0..1 bounding box space (center at 0.5, 0.5, max radius 0.5)
        # However, to perfectly touch the bounding box edges at the peaks, max_r must map to 0.5.
        px = 0.5 + 0.5 * r * math.sin(angle)
        py = 0.5 - 0.5 * r * math.cos(angle)
        
        points.append(f"{px:.5f} {py:.5f}")
        
    path_str = f"M {points[0]} " + " ".join([f"L {p}" for p in points[1:]]) + " Z"
    print(path_str)

generate_cookie_path(12, 0.92, 1.0, 1.5)
