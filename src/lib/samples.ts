export const SAMPLE_PROGRAMS = {
  pygame: `import pygame
import random

pygame.init()
screen = pygame.display.set_mode((900, 560))
pygame.display.set_caption("Pygame Emulator Demo")
clock = pygame.time.Clock()

balls = []
for _ in range(18):
    balls.append({
        "x": random.randint(20, 860),
        "y": random.randint(20, 520),
        "vx": random.choice([-1, 1]) * random.uniform(1.0, 4.0),
        "vy": random.choice([-1, 1]) * random.uniform(1.0, 4.0),
        "r": random.randint(10, 26),
        "color": (
            random.randint(40, 255),
            random.randint(40, 255),
            random.randint(40, 255),
        ),
    })

running = True
# Browser-safe loop cap for this emulator runtime.
# You can increase this, but endless loops may trigger browser script timeout.
frame = 0
max_frames = 2400
while running:
    frame += 1
    if frame > max_frames:
        print("Reached demo frame limit. Press Play again to rerun.")
        break

    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

    screen.fill((12, 14, 20))

    for ball in balls:
        ball["x"] += ball["vx"]
        ball["y"] += ball["vy"]
        if ball["x"] <= ball["r"] or ball["x"] >= 900 - ball["r"]:
            ball["vx"] *= -1
        if ball["y"] <= ball["r"] or ball["y"] >= 560 - ball["r"]:
            ball["vy"] *= -1
        pygame.draw.circle(screen, ball["color"], (int(ball["x"]), int(ball["y"])), ball["r"])

    pygame.display.flip()
    clock.tick(60)
`,
  turtle: `import turtle
import random
import time

screen = turtle.Screen()
screen.setup(width=900, height=560)
screen.bgcolor("black")
screen.title("Turtle Emulator Demo")

t = turtle.Turtle()
t.speed(0)
t.pensize(2)
t.color("cyan")

for _ in range(120):
    t.forward(5 + random.randint(0, 18))
    t.left(17)
    if random.random() < 0.08:
        t.color(
            random.random(),
            random.random(),
            random.random(),
        )
    if random.random() < 0.1:
        t.penup()
        t.goto(random.randint(-350, 350), random.randint(-220, 220))
        t.pendown()
    time.sleep(0.02)
`,
  advanced: `import pygame
import random
import time

pygame.init()
screen = pygame.display.set_mode((900, 560))
pygame.display.set_caption("Advanced API Demo")
clock = pygame.time.Clock()
font = pygame.font.SysFont("Arial", 20)

x, y = 450, 280
vx, vy = 0, 0
trail = []

running = True
frames = 0
while running:
    frames += 1
    if frames > 3000:
        print("Demo finished.")
        break

    events = pygame.event.get()
    for event in events:
        if event.type == pygame.QUIT:
            running = False
        if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
            running = False

    # keyboard-like movement via event stream keys
    for event in events:
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_LEFT:
                vx = -4
            elif event.key == pygame.K_RIGHT:
                vx = 4
            elif event.key == pygame.K_UP:
                vy = -4
            elif event.key == pygame.K_DOWN:
                vy = 4
        elif event.type == pygame.KEYUP:
            if event.key in [pygame.K_LEFT, pygame.K_RIGHT]:
                vx = 0
            if event.key in [pygame.K_UP, pygame.K_DOWN]:
                vy = 0

    x += vx
    y += vy
    x = max(20, min(880, x))
    y = max(20, min(540, y))

    trail.append((x, y))
    if len(trail) > 90:
        trail.pop(0)

    screen.fill((8, 10, 14))

    # polygon + lines + ellipse API usage
    pygame.draw.polygon(screen, (22, 120, 255), [(120, 80), (220, 110), (180, 220)], 0)
    pygame.draw.ellipse(screen, (255, 110, 80), (680, 80, 140, 80), 3)
    pygame.draw.lines(screen, (120, 255, 200), False, [(60, 500), (200, 470), (340, 510), (460, 480)], 2)

    for i in range(1, len(trail)):
        c = (40 + i * 2, 120 + i, 255 - i)
        pygame.draw.line(screen, c, trail[i - 1], trail[i], 2)

    pygame.draw.circle(screen, (255, 240, 80), (int(x), int(y)), 14)
    msg = font.render("Arrow keys move | ESC quits", True, (240, 240, 240))
    screen.blit(msg, (20, 30))

    pygame.display.flip()
    clock.tick(60)
`,
}

export type SampleProgramId = keyof typeof SAMPLE_PROGRAMS
