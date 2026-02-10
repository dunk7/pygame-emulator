export const SAMPLE_PROGRAMS = {
  pygame: `import pygame
import math
import random

# --- Constants ---
WIDTH, HEIGHT = 1000, 750
MAP_SIZE = 4000
FPS = 60

# Colors
CLR_BG = (5, 5, 15)
CLR_PLAYER = (0, 255, 200)
CLR_ENEMY = (255, 40, 70)
CLR_TANK = (200, 20, 50)
CLR_SWARM = (255, 200, 0)
CLR_BULLET = (255, 255, 150)
CLR_XP = (190, 80, 255)
CLR_SHIELD = (0, 180, 255)
CLR_HUD_BG = (20, 20, 30, 150)

class Camera:
    def __init__(self):
        self.offset = pygame.Vector2(0, 0)
        self.shake = 0

    def update(self, target, dt):
        # Smooth follow
        goal = pygame.Vector2(WIDTH//2, HEIGHT//2) - target.pos
        self.offset += (goal - self.offset) * 0.1 
        
        if self.shake > 0:
            self.shake -= dt * 60
            self.offset += pygame.Vector2(random.uniform(-1, 1), random.uniform(-1, 1)) * self.shake

class Particle(pygame.sprite.Sprite):
    def __init__(self, pos, color, groups):
        super().__init__(groups)
        self.image = pygame.Surface((4, 4))
        self.image.fill(color)
        self.rect = self.image.get_rect(center=pos)
        self.pos = pygame.Vector2(pos)
        self.vel = pygame.Vector2(random.uniform(-1, 1), random.uniform(-1, 1)) * random.uniform(100, 300)
        self.life = 0.5

    def update(self, dt, *args):
        self.life -= dt
        self.pos += self.vel * dt
        self.rect.center = self.pos
        if self.life <= 0: self.kill()

class Bullet(pygame.sprite.Sprite):
    def __init__(self, pos, angle, groups, damage=1):
        super().__init__(groups)
        self.image = pygame.Surface((12, 12), pygame.SRCALPHA)
        pygame.draw.circle(self.image, CLR_BULLET, (6, 6), 5)
        self.rect = self.image.get_rect(center=pos)
        self.pos = pygame.Vector2(pos)
        self.damage = damage
        rad = math.radians(angle + 90)
        self.vel = pygame.Vector2(math.cos(rad), -math.sin(rad)) * 900
        self.life = 1.5

    def update(self, dt, *args):
        self.life -= dt
        self.pos += self.vel * dt
        self.rect.center = self.pos
        if self.life <= 0 or not (0 < self.pos.x < MAP_SIZE and 0 < self.pos.y < MAP_SIZE):
            self.kill()

class Enemy(pygame.sprite.Sprite):
    def __init__(self, player, groups, type="normal"):
        super().__init__(groups)
        self.player = player
        self.type = type
        
        # Stats based on type
        stats = {
            "normal": {"hp": 2, "speed": 180, "size": 30, "color": CLR_ENEMY},
            "tank":   {"hp": 8, "speed": 100, "size": 50, "color": CLR_TANK},
            "swarm":  {"hp": 1, "speed": 300, "size": 20, "color": CLR_SWARM}
        }
        s = stats[type]
        self.hp = s["hp"]
        self.speed = s["speed"]
        
        self.image = pygame.Surface((s["size"], s["size"]), pygame.SRCALPHA)
        pygame.draw.rect(self.image, s["color"], (0, 0, s["size"], s["size"]), border_radius=5)
        pygame.draw.rect(self.image, (255, 255, 255), (0, 0, s["size"], s["size"]), 2, border_radius=5)
        
        angle = random.uniform(0, math.pi*2)
        self.pos = self.player.pos + pygame.Vector2(math.cos(angle), math.sin(angle)) * 800
        self.rect = self.image.get_rect(center=self.pos)

    def update(self, dt, *args):
        dir_vec = (self.player.pos - self.pos)
        if dir_vec.length() > 0:
            self.pos += dir_vec.normalize() * self.speed * dt
            self.rect.center = self.pos

class Player(pygame.sprite.Sprite):
    def __init__(self, groups):
        super().__init__(groups)
        self.raw_img = pygame.Surface((44, 44), pygame.SRCALPHA)
        pygame.draw.polygon(self.raw_img, CLR_PLAYER, [(22, 0), (44, 44), (22, 32), (0, 44)])
        self.image = self.raw_img
        self.rect = self.image.get_rect(center=(MAP_SIZE//2, MAP_SIZE//2))
        self.pos = pygame.Vector2(self.rect.center)
        
        self.hp = 100
        self.max_hp = 100
        self.speed = 400
        self.fire_rate = 350
        self.bullets_count = 1
        self.shield_active = False
        self.has_shield_upgrade = False
        self.xp = 0
        self.xp_next = 100
        self.level = 1
        self.angle = 0

    def update(self, dt, cam_offset, *args):
        keys = pygame.key.get_pressed()
        move = pygame.Vector2(0, 0)
        if keys[pygame.K_w]: move.y -= 1
        if keys[pygame.K_s]: move.y += 1
        if keys[pygame.K_a]: move.x -= 1
        if keys[pygame.K_d]: move.x += 1
        
        if move.length() > 0:
            self.pos += move.normalize() * self.speed * dt
        
        self.pos.x = max(20, min(self.pos.x, MAP_SIZE-20))
        self.pos.y = max(20, min(self.pos.y, MAP_SIZE-20))

        m_pos = pygame.mouse.get_pos()
        rel = (pygame.Vector2(m_pos) - cam_offset) - self.pos
        self.angle = math.degrees(math.atan2(-rel.y, rel.x)) - 90
        self.image = pygame.transform.rotate(self.raw_img, self.angle)
        self.rect = self.image.get_rect(center=self.pos)

class Game:
    def __init__(self):
        pygame.init()
        self.screen = pygame.display.set_mode((WIDTH, HEIGHT))
        pygame.display.set_caption("NEON SURVIVOR")
        self.clock = pygame.time.Clock()
        self.camera = Camera()
        self.font = pygame.font.SysFont("Arial", 24, bold=True)
        self.stars = [pygame.Vector2(random.randint(0, MAP_SIZE), random.randint(0, MAP_SIZE)) for _ in range(400)]
        self.reset()

    def reset(self):
        self.all_sprites = pygame.sprite.Group()
        self.enemies = pygame.sprite.Group()
        self.bullets = pygame.sprite.Group()
        self.xp_gems = pygame.sprite.Group()
        self.particles = pygame.sprite.Group()
        self.player = Player(self.all_sprites)
        self.state = "PLAYING"
        self.last_shot = 0
        self.spawn_timer = 0
        self.score = 0

    def draw_ui(self):
        # Health Bar
        hb_width = 200
        pygame.draw.rect(self.screen, (50, 0, 0), (20, HEIGHT-40, hb_width, 20))
        hp_pct = max(0, self.player.hp / self.player.max_hp)
        pygame.draw.rect(self.screen, (0, 255, 100), (20, HEIGHT-40, hb_width * hp_pct, 20))
        
        # XP Bar
        xp_pct = self.player.xp / self.player.xp_next
        pygame.draw.rect(self.screen, (30, 30, 40), (0, 0, WIDTH, 10))
        pygame.draw.rect(self.screen, CLR_XP, (0, 0, WIDTH * xp_pct, 10))
        
        # Text
        score_txt = self.font.render(f"SCORE: {self.score}", True, (255, 255, 255))
        lvl_txt = self.font.render(f"LEVEL: {self.player.level}", True, CLR_XP)
        self.screen.blit(score_txt, (20, 30))
        self.screen.blit(lvl_txt, (20, 60))

        if self.state == "LEVEL_UP":
            overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
            overlay.fill((0,0,0,180))
            self.screen.blit(overlay, (0,0))
            msg = self.font.render("UPGRADE: [1] ATTACK SPEED  [2] MULTI-SHOT  [3] HEAL", True, (255, 255, 255))
            self.screen.blit(msg, (WIDTH//2 - msg.get_width()//2, HEIGHT//2))

    def update_logic(self, dt):
        # Dynamic Spawning
        self.spawn_timer += dt
        spawn_rate = max(0.15, 0.8 - (self.player.level * 0.05))
        if self.spawn_timer > spawn_rate:
            choice = random.random()
            if choice < 0.1: t = "tank"
            elif choice < 0.3: t = "swarm"
            else: t = "normal"
            Enemy(self.player, [self.all_sprites, self.enemies], t)
            self.spawn_timer = 0

        self.all_sprites.update(dt, self.camera.offset)
        self.particles.update(dt)
        self.camera.update(self.player, dt)

        # Shooting
        if pygame.mouse.get_pressed()[0]:
            now = pygame.time.get_ticks()
            if now - self.last_shot > self.player.fire_rate:
                for i in range(self.player.bullets_count):
                    angle_off = (i - (self.player.bullets_count-1)/2) * 10
                    Bullet(self.player.pos, self.player.angle + angle_off, [self.all_sprites, self.bullets])
                self.last_shot = now

        # Collisions
        for b in self.bullets:
            hits = pygame.sprite.spritecollide(b, self.enemies, False)
            if hits:
                for e in hits:
                    e.hp -= 1
                    for _ in range(3): Particle(e.pos, CLR_BULLET, [self.all_sprites, self.particles])
                    if e.hp <= 0:
                        self.score += 100 if e.type == "tank" else 20
                        gem = pygame.sprite.Sprite([self.all_sprites, self.xp_gems])
                        gem.image = pygame.Surface((10,10), pygame.SRCALPHA); pygame.draw.circle(gem.image, CLR_XP, (5,5), 5)
                        gem.rect = gem.image.get_rect(center=e.rect.center); gem.pos = pygame.Vector2(gem.rect.center)
                        e.kill()
                b.kill()

        # XP Pickup
        for g in self.xp_gems:
            d = g.pos.distance_to(self.player.pos)
            if d < 150: g.pos += (self.player.pos - g.pos).normalize() * 600 * dt
            g.rect.center = g.pos
            if d < 30:
                g.kill()
                self.player.xp += 25
                if self.player.xp >= self.player.xp_next:
                    self.state = "LEVEL_UP"
                    self.player.level += 1
                    self.player.xp = 0
                    self.player.xp_next *= 1.2

        # Enemy Contact
        if pygame.sprite.spritecollide(self.player, self.enemies, True):
            self.player.hp -= 15
            self.camera.shake = 20
            if self.player.hp <= 0: self.state = "GAMEOVER"

    def run(self):
        while True:
            dt = self.clock.tick(FPS) / 1000.0
            for event in pygame.event.get():
                if event.type == pygame.QUIT: pygame.quit(); return
                if event.type == pygame.KEYDOWN and self.state == "LEVEL_UP":
                    if event.key == pygame.K_1: self.player.fire_rate *= 0.8; self.state = "PLAYING"
                    if event.key == pygame.K_2: self.player.bullets_count += 1; self.state = "PLAYING"
                    if event.key == pygame.K_3: self.player.hp = self.player.max_hp; self.state = "PLAYING"
                if event.type == pygame.KEYDOWN and self.state == "GAMEOVER":
                    if event.key == pygame.K_SPACE: self.reset()

            if self.state == "PLAYING":
                self.update_logic(dt)
            
            # Draw
            self.screen.fill(CLR_BG)
            # Background stars
            for s in self.stars:
                pos = s + self.camera.offset
                if -10 < pos.x < WIDTH + 10 and -10 < pos.y < HEIGHT + 10:
                    pygame.draw.circle(self.screen, (70, 70, 100), pos, 1)

            for s in self.all_sprites:
                self.screen.blit(s.image, s.rect.topleft + self.camera.offset)
            
            self.draw_ui()
            if self.state == "GAMEOVER":
                txt = self.font.render("GAME OVER - PRESS SPACE", True, (255, 50, 50))
                self.screen.blit(txt, (WIDTH//2 - txt.get_width()//2, HEIGHT//2))
                
            pygame.display.flip()

if __name__ == "__main__":
    Game().run()
`,
  turtle: `import turtle
import math
import random

screen = turtle.Screen()
screen.setup(width=900, height=560)
screen.bgcolor("black")
screen.title("Turtle Graphics - Mandala & Fractals")

# Create multiple turtles for layered effects
turtles = []
colors = ["cyan", "magenta", "yellow", "lime", "orange", "pink", "aqua", "violet"]

# Main mandala turtle
t1 = turtle.Turtle()
t1.speed(0)
t1.hideturtle()
turtles.append(t1)

# Spiral turtle
t2 = turtle.Turtle()
t2.speed(0)
t2.hideturtle()
turtles.append(t2)

# Flower turtle
t3 = turtle.Turtle()
t3.speed(0)
t3.hideturtle()
turtles.append(t3)

# Star field turtle
t4 = turtle.Turtle()
t4.speed(0)
t4.hideturtle()
turtles.append(t4)

# Draw mandala pattern
t1.penup()
t1.goto(0, -200)
t1.pendown()
t1.pensize(2)

for layer in range(8):
    t1.color(colors[layer % len(colors)])
    for i in range(36):
        t1.forward(200 - layer * 20)
        t1.backward(200 - layer * 20)
        t1.left(10)
    t1.left(5)

# Draw spiral pattern
t2.penup()
t2.goto(-200, 200)
t2.pendown()
t2.pensize(1.5)

for i in range(200):
    t2.color(colors[i % len(colors)])
    t2.forward(i * 0.5)
    t2.right(91)

# Draw flower pattern
t3.penup()
t3.goto(300, -150)
t3.pendown()
t3.pensize(2)

for petal in range(12):
    t3.color(colors[petal % len(colors)])
    for i in range(2):
        t3.circle(50, 60)
        t3.left(120)
        t3.circle(50, 60)
        t3.left(60)
    t3.left(30)

# Draw star field
t4.penup()
t4.pensize(1)

for star in range(50):
    x = random.randint(-400, 400)
    y = random.randint(-250, 250)
    t4.goto(x, y)
    t4.color(random.choice(colors))
    t4.pendown()
    for i in range(5):
        t4.forward(15)
        t4.backward(15)
        t4.left(72)
    t4.penup()

# Draw fractal tree
t5 = turtle.Turtle()
t5.speed(0)
t5.hideturtle()
t5.penup()
t5.goto(-300, -200)
t5.pendown()
t5.pensize(2)
t5.color("lime")
t5.left(90)

def tree(branch_len, angle, depth):
    if depth > 0:
        t5.forward(branch_len)
        t5.right(angle)
        tree(branch_len * 0.7, angle, depth - 1)
        t5.left(angle * 2)
        tree(branch_len * 0.7, angle, depth - 1)
        t5.right(angle)
        t5.backward(branch_len)

tree(60, 30, 6)

# Draw geometric patterns
t6 = turtle.Turtle()
t6.speed(0)
t6.hideturtle()
t6.penup()
t6.goto(200, 150)
t6.pendown()
t6.pensize(1.5)

for shape in range(3, 8):
    t6.color(colors[shape % len(colors)])
    angle = 360 / shape
    for i in range(shape):
        t6.forward(40)
        t6.left(angle)
    t6.penup()
    t6.forward(60)
    t6.pendown()

# Final spiral burst
t7 = turtle.Turtle()
t7.speed(0)
t7.hideturtle()
t7.penup()
t7.goto(0, 0)
t7.pendown()
t7.pensize(1)

for i in range(360):
    t7.color(colors[i // 45 % len(colors)])
    t7.forward(i * 0.1)
    t7.left(59)

screen.exitonclick()
`,
  snake: `import pygame
import random
import math

WIDTH, HEIGHT = 900, 560
GRID_SIZE = 20
GRID_W, GRID_H = WIDTH // GRID_SIZE, HEIGHT // GRID_SIZE

class Snake:
    def __init__(self):
        self.body = [(GRID_W//2, GRID_H//2)]
        self.direction = (1, 0)
        self.grow = False
        
    def move(self):
        head = self.body[0]
        new_head = (head[0] + self.direction[0], head[1] + self.direction[1])
        self.body.insert(0, new_head)
        if not self.grow:
            self.body.pop()
        else:
            self.grow = False
            
    def check_collision(self):
        head = self.body[0]
        if head[0] < 0 or head[0] >= GRID_W or head[1] < 0 or head[1] >= GRID_H:
            return True
        if head in self.body[1:]:
            return True
        return False

pygame.init()
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("SNAKE GAME")
clock = pygame.time.Clock()
font = pygame.font.SysFont("Arial", 32, bold=True)

snake = Snake()
food = (random.randint(0, GRID_W-1), random.randint(0, GRID_H-1))
score = 0
game_over = False
move_timer = 0
move_delay = 0.15

running = True
while running:
    dt = clock.tick(60) / 1000.0
    
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        if event.type == pygame.KEYDOWN:
            if game_over and event.key == pygame.K_SPACE:
                snake = Snake()
                food = (random.randint(0, GRID_W-1), random.randint(0, GRID_H-1))
                score = 0
                game_over = False
            elif not game_over:
                if event.key == pygame.K_UP and snake.direction != (0, 1):
                    snake.direction = (0, -1)
                elif event.key == pygame.K_DOWN and snake.direction != (0, -1):
                    snake.direction = (0, 1)
                elif event.key == pygame.K_LEFT and snake.direction != (1, 0):
                    snake.direction = (-1, 0)
                elif event.key == pygame.K_RIGHT and snake.direction != (-1, 0):
                    snake.direction = (1, 0)
    
    if not game_over:
        move_timer += dt
        if move_timer >= move_delay:
            move_timer = 0
            snake.move()
            
            if snake.body[0] == food:
                snake.grow = True
                score += 10
                while food in snake.body:
                    food = (random.randint(0, GRID_W-1), random.randint(0, GRID_H-1))
            
            if snake.check_collision():
                game_over = True
    
    screen.fill((10, 15, 25))
    
    # Draw grid
    for x in range(0, WIDTH, GRID_SIZE):
        pygame.draw.line(screen, (20, 25, 35), (x, 0), (x, HEIGHT))
    for y in range(0, HEIGHT, GRID_SIZE):
        pygame.draw.line(screen, (20, 25, 35), (0, y), (WIDTH, y))
    
    # Draw food
    fx, fy = food[0] * GRID_SIZE + GRID_SIZE//2, food[1] * GRID_SIZE + GRID_SIZE//2
    pygame.draw.circle(screen, (255, 80, 100), (fx, fy), GRID_SIZE//2 - 2)
    
    # Draw snake
    for i, (x, y) in enumerate(snake.body):
        px, py = x * GRID_SIZE + GRID_SIZE//2, y * GRID_SIZE + GRID_SIZE//2
        color = (100, 255, 150) if i == 0 else (80, 220, 120)
        pygame.draw.circle(screen, color, (px, py), GRID_SIZE//2 - 1)
        if i == 0:
            pygame.draw.circle(screen, (255, 255, 255), (px - 4, py - 4), 2)
            pygame.draw.circle(screen, (255, 255, 255), (px + 4, py - 4), 2)
    
    # UI
    score_text = font.render(f"Score: {score}", True, (255, 255, 255))
    screen.blit(score_text, (10, 10))
    
    if game_over:
        overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 180))
        screen.blit(overlay, (0, 0))
        game_over_text = font.render("GAME OVER", True, (255, 50, 50))
        restart_text = pygame.font.SysFont("Arial", 20).render("Press SPACE to restart", True, (255, 255, 255))
        screen.blit(game_over_text, (WIDTH//2 - game_over_text.get_width()//2, HEIGHT//2 - 30))
        screen.blit(restart_text, (WIDTH//2 - restart_text.get_width()//2, HEIGHT//2 + 20))
    
    pygame.display.flip()
`,
  platformer: `import pygame
import math

WIDTH, HEIGHT = 900, 560
GRAVITY = 800
JUMP_STRENGTH = -400
PLAYER_SPEED = 300

class Player:
    def __init__(self, x, y):
        self.pos = pygame.Vector2(x, y)
        self.vel = pygame.Vector2(0, 0)
        self.size = pygame.Vector2(30, 40)
        self.on_ground = False
        
    def update(self, dt, platforms):
        self.vel.y += GRAVITY * dt
        self.pos.x += self.vel.x * dt
        
        # Horizontal collision
        for p in platforms:
            if (self.pos.x < p.right and self.pos.x + self.size.x > p.left and
                self.pos.y < p.bottom and self.pos.y + self.size.y > p.top):
                if self.vel.x > 0:
                    self.pos.x = p.left - self.size.x
                elif self.vel.x < 0:
                    self.pos.x = p.right
                self.vel.x = 0
        
        self.pos.y += self.vel.y * dt
        self.on_ground = False
        
        # Vertical collision
        for p in platforms:
            if (self.pos.x < p.right and self.pos.x + self.size.x > p.left and
                self.pos.y < p.bottom and self.pos.y + self.size.y > p.top):
                if self.vel.y > 0:
                    self.pos.y = p.top - self.size.y
                    self.vel.y = 0
                    self.on_ground = True
                elif self.vel.y < 0:
                    self.pos.y = p.bottom
                    self.vel.y = 0
        
        # Keep in bounds
        self.pos.x = max(0, min(WIDTH - self.size.x, self.pos.x))
        if self.pos.y > HEIGHT:
            self.pos = pygame.Vector2(50, 100)
            self.vel = pygame.Vector2(0, 0)

pygame.init()
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("PLATFORMER")
clock = pygame.time.Clock()
font = pygame.font.SysFont("Arial", 24)

player = Player(50, 100)
platforms = [
    pygame.Rect(0, HEIGHT - 40, WIDTH, 40),
    pygame.Rect(200, 450, 150, 20),
    pygame.Rect(400, 380, 150, 20),
    pygame.Rect(600, 300, 200, 20),
    pygame.Rect(100, 250, 120, 20),
    pygame.Rect(350, 180, 100, 20),
    pygame.Rect(550, 120, 150, 20),
]

running = True
while running:
    dt = clock.tick(60) / 1000.0
    
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_SPACE and player.on_ground:
                player.vel.y = JUMP_STRENGTH
    
    keys = pygame.key.get_pressed()
    player.vel.x = 0
    if keys[pygame.K_LEFT] or keys[pygame.K_a]:
        player.vel.x = -PLAYER_SPEED
    if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
        player.vel.x = PLAYER_SPEED
    
    player.update(dt, platforms)
    
    screen.fill((20, 25, 40))
    
    # Draw platforms
    for p in platforms:
        pygame.draw.rect(screen, (100, 150, 200), p)
        pygame.draw.rect(screen, (150, 200, 255), p, 2)
    
    # Draw player
    pygame.draw.rect(screen, (255, 100, 100), (player.pos.x, player.pos.y, player.size.x, player.size.y))
    pygame.draw.rect(screen, (255, 150, 150), (player.pos.x, player.pos.y, player.size.x, player.size.y), 2)
    
    # Instructions
    inst = font.render("Arrow Keys/A+D: Move | Space: Jump", True, (255, 255, 255))
    screen.blit(inst, (10, 10))
    
    pygame.display.flip()
`,
  space_shooter: `import pygame
import random
import math

WIDTH, HEIGHT = 900, 560

class Bullet:
    def __init__(self, x, y, vx, vy):
        self.pos = pygame.Vector2(x, y)
        self.vel = pygame.Vector2(vx, vy)
        self.radius = 4
        
    def update(self, dt):
        self.pos += self.vel * dt
        
    def draw(self, screen):
        pygame.draw.circle(screen, (255, 255, 100), (int(self.pos.x), int(self.pos.y)), self.radius)

class Enemy:
    def __init__(self):
        self.pos = pygame.Vector2(random.randint(50, WIDTH-50), -30)
        self.vel = pygame.Vector2(random.uniform(-50, 50), random.uniform(80, 150))
        self.radius = 20
        self.hp = 1
        
    def update(self, dt):
        self.pos += self.vel * dt
        
    def draw(self, screen):
        pygame.draw.circle(screen, (255, 80, 80), (int(self.pos.x), int(self.pos.y)), self.radius)
        pygame.draw.circle(screen, (255, 150, 150), (int(self.pos.x), int(self.pos.y)), self.radius, 2)

class Player:
    def __init__(self):
        self.pos = pygame.Vector2(WIDTH//2, HEIGHT - 60)
        self.radius = 20
        self.speed = 400
        self.shoot_cooldown = 0
        
    def update(self, dt, keys):
        if keys[pygame.K_LEFT] or keys[pygame.K_a]:
            self.pos.x -= self.speed * dt
        if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
            self.pos.x += self.speed * dt
        self.pos.x = max(self.radius, min(WIDTH - self.radius, self.pos.x))
        self.shoot_cooldown = max(0, self.shoot_cooldown - dt)
        
    def shoot(self):
        if self.shoot_cooldown <= 0:
            self.shoot_cooldown = 0.2
            return Bullet(self.pos.x, self.pos.y - self.radius, 0, -600)
        return None
        
    def draw(self, screen):
        pygame.draw.polygon(screen, (100, 200, 255), [
            (int(self.pos.x), int(self.pos.y - self.radius)),
            (int(self.pos.x - self.radius), int(self.pos.y + self.radius)),
            (int(self.pos.x), int(self.pos.y + self.radius//2)),
            (int(self.pos.x + self.radius), int(self.pos.y + self.radius))
        ])

pygame.init()
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("SPACE SHOOTER")
clock = pygame.time.Clock()
font = pygame.font.SysFont("Arial", 24, bold=True)

player = Player()
bullets = []
enemies = []
particles = []
score = 0
game_over = False
spawn_timer = 0

running = True
while running:
    dt = clock.tick(60) / 1000.0
    
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        if event.type == pygame.KEYDOWN:
            if game_over and event.key == pygame.K_SPACE:
                player = Player()
                bullets = []
                enemies = []
                score = 0
                game_over = False
            elif event.key == pygame.K_SPACE and not game_over:
                b = player.shoot()
                if b:
                    bullets.append(b)
    
    if not game_over:
        keys = pygame.key.get_pressed()
        player.update(dt, keys)
        
        spawn_timer += dt
        if spawn_timer > 1.5:
            enemies.append(Enemy())
            spawn_timer = 0
        
        for bullet in bullets[:]:
            bullet.update(dt)
            if bullet.pos.y < 0 or bullet.pos.y > HEIGHT:
                bullets.remove(bullet)
        
        for enemy in enemies[:]:
            enemy.update(dt)
            if enemy.pos.y > HEIGHT + 50:
                enemies.remove(enemy)
            
            for bullet in bullets[:]:
                if enemy.pos.distance_to(bullet.pos) < enemy.radius + bullet.radius:
                    enemies.remove(enemy)
                    bullets.remove(bullet)
                    score += 10
                    for _ in range(8):
                        particles.append({
                            "pos": pygame.Vector2(enemy.pos),
                            "vel": pygame.Vector2(random.uniform(-100, 100), random.uniform(-100, 100)),
                            "life": 0.5
                        })
                    break
            
            if enemy.pos.distance_to(player.pos) < enemy.radius + player.radius:
                game_over = True
        
        for p in particles[:]:
            p["life"] -= dt
            if p["life"] <= 0:
                particles.remove(p)
            else:
                p["pos"] += p["vel"] * dt
    
    screen.fill((5, 5, 15))
    
    # Stars
    for _ in range(50):
        x = random.randint(0, WIDTH)
        y = random.randint(0, HEIGHT)
        pygame.draw.circle(screen, (200, 200, 255), (x, y), 1)
    
    # Particles
    for p in particles:
        alpha = int(255 * (p["life"] / 0.5))
        color = (255, 200, 100, alpha)
        pygame.draw.circle(screen, (255, 200, 100), (int(p["pos"].x), int(p["pos"].y)), 3)
    
    # Bullets
    for bullet in bullets:
        bullet.draw(screen)
    
    # Enemies
    for enemy in enemies:
        enemy.draw(screen)
    
    # Player
    player.draw(screen)
    
    # UI
    score_text = font.render(f"Score: {score}", True, (255, 255, 255))
    screen.blit(score_text, (10, 10))
    
    if game_over:
        overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 180))
        screen.blit(overlay, (0, 0))
        game_over_text = font.render("GAME OVER", True, (255, 50, 50))
        restart_text = pygame.font.SysFont("Arial", 20).render("Press SPACE to restart", True, (255, 255, 255))
        screen.blit(game_over_text, (WIDTH//2 - game_over_text.get_width()//2, HEIGHT//2 - 30))
        screen.blit(restart_text, (WIDTH//2 - restart_text.get_width()//2, HEIGHT//2 + 20))
    
    pygame.display.flip()
`,
  puzzle: `import pygame
import random

WIDTH, HEIGHT = 900, 560
GRID_SIZE = 4
CELL_SIZE = 100
GRID_X = (WIDTH - GRID_SIZE * CELL_SIZE) // 2
GRID_Y = (HEIGHT - GRID_SIZE * CELL_SIZE) // 2

class Puzzle:
    def __init__(self):
        self.grid = list(range(1, GRID_SIZE * GRID_SIZE))
        self.grid.append(0)  # Empty space
        self.empty_pos = GRID_SIZE * GRID_SIZE - 1
        self.shuffle()
        
    def shuffle(self):
        for _ in range(1000):
            moves = []
            row = self.empty_pos // GRID_SIZE
            col = self.empty_pos % GRID_SIZE
            if row > 0:
                moves.append(self.empty_pos - GRID_SIZE)
            if row < GRID_SIZE - 1:
                moves.append(self.empty_pos + GRID_SIZE)
            if col > 0:
                moves.append(self.empty_pos - 1)
            if col < GRID_SIZE - 1:
                moves.append(self.empty_pos + 1)
            if moves:
                self.swap(random.choice(moves))
    
    def swap(self, pos):
        self.grid[self.empty_pos], self.grid[pos] = self.grid[pos], self.grid[self.empty_pos]
        self.empty_pos = pos
    
    def try_move(self, pos):
        row = pos // GRID_SIZE
        col = pos % GRID_SIZE
        empty_row = self.empty_pos // GRID_SIZE
        empty_col = self.empty_pos % GRID_SIZE
        
        if (row == empty_row and abs(col - empty_col) == 1) or \
           (col == empty_col and abs(row - empty_row) == 1):
            self.swap(pos)
            return True
        return False
    
    def is_solved(self):
        for i in range(GRID_SIZE * GRID_SIZE - 1):
            if self.grid[i] != i + 1:
                return False
        return True

pygame.init()
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("SLIDING PUZZLE")
clock = pygame.time.Clock()
font = pygame.font.SysFont("Arial", 36, bold=True)
small_font = pygame.font.SysFont("Arial", 20)

puzzle = Puzzle()
solved = False
moves = 0

running = True
while running:
    dt = clock.tick(60) / 1000.0
    
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_r:
                puzzle = Puzzle()
                solved = False
                moves = 0
        if event.type == pygame.MOUSEBUTTONDOWN and not solved:
            mx, my = pygame.mouse.get_pos()
            if GRID_X <= mx < GRID_X + GRID_SIZE * CELL_SIZE and \
               GRID_Y <= my < GRID_Y + GRID_SIZE * CELL_SIZE:
                rel_x = mx - GRID_X
                rel_y = my - GRID_Y
                col = rel_x // CELL_SIZE
                row = rel_y // CELL_SIZE
                pos = row * GRID_SIZE + col
                if puzzle.try_move(pos):
                    moves += 1
                    if puzzle.is_solved():
                        solved = True
    
    screen.fill((15, 20, 30))
    
    # Draw grid
    for row in range(GRID_SIZE):
        for col in range(GRID_SIZE):
            idx = row * GRID_SIZE + col
            value = puzzle.grid[idx]
            x = GRID_X + col * CELL_SIZE
            y = GRID_Y + row * CELL_SIZE
            
            if value != 0:
                color = (80, 120, 200) if not solved else (100, 200, 100)
                pygame.draw.rect(screen, color, (x + 5, y + 5, CELL_SIZE - 10, CELL_SIZE - 10), border_radius=8)
                pygame.draw.rect(screen, (150, 180, 255), (x + 5, y + 5, CELL_SIZE - 10, CELL_SIZE - 10), 2, border_radius=8)
                text = font.render(str(value), True, (255, 255, 255))
                text_rect = text.get_rect(center=(x + CELL_SIZE//2, y + CELL_SIZE//2))
                screen.blit(text, text_rect)
    
    # UI
    moves_text = small_font.render(f"Moves: {moves}", True, (255, 255, 255))
    screen.blit(moves_text, (10, 10))
    
    if solved:
        solved_text = font.render("SOLVED!", True, (100, 255, 100))
        screen.blit(solved_text, (WIDTH//2 - solved_text.get_width()//2, GRID_Y - 60))
        restart_text = small_font.render("Press R to restart", True, (200, 200, 200))
        screen.blit(restart_text, (WIDTH//2 - restart_text.get_width()//2, GRID_Y - 30))
    else:
        hint_text = small_font.render("Click tiles to move | R to reset", True, (200, 200, 200))
        screen.blit(hint_text, (WIDTH//2 - hint_text.get_width()//2, GRID_Y - 30))
    
    pygame.display.flip()
`,
}

export type SampleProgramId = keyof typeof SAMPLE_PROGRAMS
