/// <reference lib="webworker" />

import type { DrawCommand, RuntimeEvent, WorkerInboundMessage, WorkerOutboundMessage } from './pyWorkerProtocol'

declare const self: DedicatedWorkerGlobalScope & {
  loadPyodide?: (config: {
    indexURL: string
    stdout?: (message: string) => void
    stderr?: (message: string) => void
  }) => Promise<{
    registerJsModule: (name: string, module: Record<string, unknown>) => void
    runPythonAsync: (code: string) => Promise<unknown>
  }>
}

const PYODIDE_INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v0.27.3/full/'
const FLUSH_INTERVAL_MS = 14
const MAX_BUFFERED_COMMANDS = 1200
const MAX_EVENT_QUEUE = 240
const SHARED_INPUT_INDEX = {
  mouseX: 0,
  mouseY: 1,
  mouseLeft: 2,
  mouseMiddle: 3,
  mouseRight: 4,
  quitRequested: 5,
  keysStart: 16,
} as const
const SHARED_PYGAME_KEYS = [
  'Escape',
  ' ',
  'Enter',
  'Tab',
  'Backspace',
  'Delete',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Shift',
  'Control',
  'Alt',
  'Meta',
  '-',
  '=',
  '[',
  ']',
  '\\',
  ';',
  "'",
  ',',
  '.',
  '/',
  '`',
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  ...'0123456789'.split(''),
  ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`),
]

const PY_EMULATOR_BOOTSTRAP = `
import json
import math
import string as _string
import sys
import time as _time
import types
import emulator_bridge as bridge

class Rect:
    def __init__(self, x, y, w, h):
        self.x = int(x)
        self.y = int(y)
        self.width = int(w)
        self.height = int(h)

    @property
    def left(self):
        return self.x

    @left.setter
    def left(self, value):
        self.x = int(value)

    @property
    def top(self):
        return self.y

    @top.setter
    def top(self, value):
        self.y = int(value)

    @property
    def right(self):
        return self.x + self.width

    @right.setter
    def right(self, value):
        self.x = int(value) - self.width

    @property
    def bottom(self):
        return self.y + self.height

    @bottom.setter
    def bottom(self, value):
        self.y = int(value) - self.height

    @property
    def centerx(self):
        return self.x + self.width // 2

    @centerx.setter
    def centerx(self, value):
        self.x = int(value) - self.width // 2

    @property
    def centery(self):
        return self.y + self.height // 2

    @centery.setter
    def centery(self, value):
        self.y = int(value) - self.height // 2

    @property
    def center(self):
        return (self.centerx, self.centery)

    @center.setter
    def center(self, value):
        self.centerx = value[0]
        self.centery = value[1]

    @property
    def topleft(self):
        return (self.left, self.top)

    @topleft.setter
    def topleft(self, value):
        self.left = value[0]
        self.top = value[1]

    @property
    def topright(self):
        return (self.right, self.top)

    @topright.setter
    def topright(self, value):
        self.right = value[0]
        self.top = value[1]

    @property
    def bottomleft(self):
        return (self.left, self.bottom)

    @bottomleft.setter
    def bottomleft(self, value):
        self.left = value[0]
        self.bottom = value[1]

    @property
    def bottomright(self):
        return (self.right, self.bottom)

    @bottomright.setter
    def bottomright(self, value):
        self.right = value[0]
        self.bottom = value[1]

    @property
    def midtop(self):
        return (self.centerx, self.top)

    @midtop.setter
    def midtop(self, value):
        self.centerx = value[0]
        self.top = value[1]

    @property
    def midbottom(self):
        return (self.centerx, self.bottom)

    @midbottom.setter
    def midbottom(self, value):
        self.centerx = value[0]
        self.bottom = value[1]

    @property
    def midleft(self):
        return (self.left, self.centery)

    @midleft.setter
    def midleft(self, value):
        self.left = value[0]
        self.centery = value[1]

    @property
    def midright(self):
        return (self.right, self.centery)

    @midright.setter
    def midright(self, value):
        self.right = value[0]
        self.centery = value[1]

    def _coerce_offset(self, x, y=None):
        if y is None and hasattr(x, "__len__"):
            return (int(x[0]), int(x[1]))
        return (int(x), int(0 if y is None else y))

    def move(self, x, y=None):
        dx, dy = self._coerce_offset(x, y)
        return Rect(self.x + dx, self.y + dy, self.width, self.height)

    def move_ip(self, x, y=None):
        dx, dy = self._coerce_offset(x, y)
        self.x += dx
        self.y += dy
        return None

    def inflate(self, x, y=None):
        if y is None and hasattr(x, "__len__"):
            dw = int(x[0])
            dh = int(x[1])
        else:
            dw = int(x)
            dh = int(0 if y is None else y)
        nx = self.x - dw // 2
        ny = self.y - dh // 2
        return Rect(nx, ny, self.width + dw, self.height + dh)

    def colliderect(self, other):
        ox, oy, ow, oh = _rect_xywh(other)
        return (
            self.x < ox + ow and
            self.x + self.width > ox and
            self.y < oy + oh and
            self.y + self.height > oy
        )

    def contains(self, other):
        ox, oy, ow, oh = _rect_xywh(other)
        return (
            ox >= self.x and
            oy >= self.y and
            ox + ow <= self.x + self.width and
            oy + oh <= self.y + self.height
        )

class Vector2:
    def __init__(self, x=0.0, y=None):
        self.x = 0.0
        self.y = 0.0
        self.update(x, y)

    @staticmethod
    def _coerce_xy(x=0.0, y=None):
        if isinstance(x, Vector2):
            return (float(x.x), float(x.y))
        if y is None and hasattr(x, "x") and hasattr(x, "y"):
            return (float(x.x), float(x.y))

        def _coerce_scalar(value):
            if isinstance(value, Vector2):
                return float(value.x)
            if hasattr(value, "x") and hasattr(value, "y"):
                return float(value.x)
            if isinstance(value, (tuple, list)):
                if len(value) == 0:
                    raise TypeError("expected a scalar value")
                return _coerce_scalar(value[0])
            return float(value)

        if y is None:
            if isinstance(x, (tuple, list)):
                if len(x) == 1:
                    return Vector2._coerce_xy(x[0], None)
                if len(x) >= 2:
                    return (_coerce_scalar(x[0]), _coerce_scalar(x[1]))
            if hasattr(x, "__len__"):
                try:
                    values = list(x)
                except Exception:
                    values = None
                if values is not None:
                    if len(values) == 1:
                        return Vector2._coerce_xy(values[0], None)
                    if len(values) >= 2:
                        return (_coerce_scalar(values[0]), _coerce_scalar(values[1]))
            return (float(x), 0.0)
        return (_coerce_scalar(x), _coerce_scalar(y))

    @property
    def xy(self):
        return (self.x, self.y)

    @xy.setter
    def xy(self, value):
        self.x, self.y = self._coerce_xy(value)

    def copy(self):
        return Vector2(self.x, self.y)

    def update(self, x=0.0, y=None):
        self.x, self.y = self._coerce_xy(x, y)
        return None

    def magnitude(self):
        return math.hypot(self.x, self.y)

    def length(self):
        return self.magnitude()

    def length_squared(self):
        return self.x * self.x + self.y * self.y

    def normalize(self):
        mag = self.magnitude()
        if mag <= 0.0:
            return Vector2(0.0, 0.0)
        return Vector2(self.x / mag, self.y / mag)

    def normalize_ip(self):
        mag = self.magnitude()
        if mag <= 0.0:
            self.x = 0.0
            self.y = 0.0
        else:
            self.x /= mag
            self.y /= mag
        return None

    def scale_to_length(self, length):
        length = float(length)
        self.normalize_ip()
        self.x *= length
        self.y *= length
        return None

    def distance_to(self, other):
        ox, oy = self._coerce_xy(other)
        return math.hypot(self.x - ox, self.y - oy)

    def dot(self, other):
        ox, oy = self._coerce_xy(other)
        return self.x * ox + self.y * oy

    def rotate(self, angle):
        radians = math.radians(float(angle))
        c = math.cos(radians)
        s = math.sin(radians)
        return Vector2(self.x * c - self.y * s, self.x * s + self.y * c)

    def rotate_ip(self, angle):
        rotated = self.rotate(angle)
        self.x = rotated.x
        self.y = rotated.y
        return None

    def angle_to(self, other):
        ox, oy = self._coerce_xy(other)
        a = math.atan2(self.y, self.x)
        b = math.atan2(oy, ox)
        return math.degrees(b - a)

    def __iter__(self):
        return iter((self.x, self.y))

    def __len__(self):
        return 2

    def __getitem__(self, index):
        if index == 0:
            return self.x
        if index == 1:
            return self.y
        raise IndexError("Vector2 index out of range")

    def __setitem__(self, index, value):
        if index == 0:
            self.x = float(value)
            return None
        if index == 1:
            self.y = float(value)
            return None
        raise IndexError("Vector2 index out of range")

    def __add__(self, other):
        ox, oy = self._coerce_xy(other)
        return Vector2(self.x + ox, self.y + oy)

    def __sub__(self, other):
        ox, oy = self._coerce_xy(other)
        return Vector2(self.x - ox, self.y - oy)

    def __mul__(self, scalar):
        if isinstance(scalar, Vector2):
            return self.dot(scalar)
        scalar = float(scalar)
        return Vector2(self.x * scalar, self.y * scalar)

    def __rmul__(self, scalar):
        return self.__mul__(scalar)

    def __truediv__(self, scalar):
        scalar = float(scalar)
        if scalar == 0.0:
            raise ZeroDivisionError("division by zero")
        return Vector2(self.x / scalar, self.y / scalar)

    def __iadd__(self, other):
        ox, oy = self._coerce_xy(other)
        self.x += ox
        self.y += oy
        return self

    def __isub__(self, other):
        ox, oy = self._coerce_xy(other)
        self.x -= ox
        self.y -= oy
        return self

    def __imul__(self, scalar):
        scalar = float(scalar)
        self.x *= scalar
        self.y *= scalar
        return self

    def __itruediv__(self, scalar):
        scalar = float(scalar)
        if scalar == 0.0:
            raise ZeroDivisionError("division by zero")
        self.x /= scalar
        self.y /= scalar
        return self

    def __neg__(self):
        return Vector2(-self.x, -self.y)

    def __eq__(self, other):
        try:
            ox, oy = self._coerce_xy(other)
        except Exception:
            return False
        return self.x == ox and self.y == oy

    def __repr__(self):
        return f"Vector2({self.x}, {self.y})"

def _rect_xywh(rect):
    if isinstance(rect, Rect):
        return (int(rect.x), int(rect.y), int(rect.width), int(rect.height))
    if hasattr(rect, "x") and hasattr(rect, "y") and hasattr(rect, "width") and hasattr(rect, "height"):
        return (int(rect.x), int(rect.y), int(rect.width), int(rect.height))
    x, y, w, h = rect
    return (int(x), int(y), int(w), int(h))

def _is_display_surface(surface):
    return bool(getattr(surface, "_is_display", False))

def _coerce_color_rgba(color):
    if isinstance(color, (tuple, list)):
        if len(color) >= 4:
            return [int(color[0]), int(color[1]), int(color[2]), int(color[3])]
        if len(color) >= 3:
            return [int(color[0]), int(color[1]), int(color[2]), 255]
    return None

def _alpha_scaled_color(color, alpha):
    if alpha is None:
        return color
    rgba = _coerce_color_rgba(color)
    if rgba is None:
        return color
    a = max(0, min(255, int(alpha)))
    rgba[3] = int(round((rgba[3] * a) / 255.0))
    return rgba

def _offset_points(points, dx, dy):
    return [[float(p[0]) + dx, float(p[1]) + dy] for p in points]

def _clone_draw_command(command):
    out = dict(command)
    points = command.get("points")
    if isinstance(points, list):
        out["points"] = [[float(p[0]), float(p[1])] for p in points]
    return out

def _blit_dest_xy(dest):
    if isinstance(dest, Rect):
        return (int(dest.x), int(dest.y))
    if hasattr(dest, "x") and hasattr(dest, "y"):
        return (int(dest.x), int(dest.y))
    if hasattr(dest, "__len__"):
        return (int(dest[0]), int(dest[1]))
    return (int(dest), 0)

def _blit_draw_command(dest_surface, command, dx, dy, alpha=None):
    op = command.get("op")
    color = _alpha_scaled_color(command.get("color"), alpha)
    if op == "fill_rect":
        x = command["x"] + dx
        y = command["y"] + dy
        w = command["w"]
        h = command["h"]
        if _is_display_surface(dest_surface):
            bridge.fill_rect(x, y, w, h, color)
        else:
            dest_surface._commands.append({"op": "fill_rect", "x": x, "y": y, "w": w, "h": h, "color": color})
        return
    if op == "draw_rect":
        x = command["x"] + dx
        y = command["y"] + dy
        w = command["w"]
        h = command["h"]
        if _is_display_surface(dest_surface):
            bridge.draw_rect(
                x,
                y,
                w,
                h,
                color,
                command["width"],
                command["border_radius"],
                command["border_top_left_radius"],
                command["border_top_right_radius"],
                command["border_bottom_left_radius"],
                command["border_bottom_right_radius"],
            )
        else:
            dest_surface._commands.append(
                {
                    "op": "draw_rect",
                    "x": x,
                    "y": y,
                    "w": w,
                    "h": h,
                    "color": color,
                    "width": command["width"],
                    "border_radius": command["border_radius"],
                    "border_top_left_radius": command["border_top_left_radius"],
                    "border_top_right_radius": command["border_top_right_radius"],
                    "border_bottom_left_radius": command["border_bottom_left_radius"],
                    "border_bottom_right_radius": command["border_bottom_right_radius"],
                }
            )
        return
    if op == "draw_circle":
        x = command["x"] + dx
        y = command["y"] + dy
        if _is_display_surface(dest_surface):
            bridge.draw_circle(x, y, command["r"], color, command["width"])
        else:
            dest_surface._commands.append(
                {"op": "draw_circle", "x": x, "y": y, "r": command["r"], "color": color, "width": command["width"]}
            )
        return
    if op == "draw_line":
        x1 = command["x1"] + dx
        y1 = command["y1"] + dy
        x2 = command["x2"] + dx
        y2 = command["y2"] + dy
        if _is_display_surface(dest_surface):
            bridge.draw_line(x1, y1, x2, y2, color, command["width"])
        else:
            dest_surface._commands.append(
                {"op": "draw_line", "x1": x1, "y1": y1, "x2": x2, "y2": y2, "color": color, "width": command["width"]}
            )
        return
    if op == "draw_polygon":
        points = _offset_points(command["points"], dx, dy)
        if _is_display_surface(dest_surface):
            bridge.draw_polygon(points, color, command["width"])
        else:
            dest_surface._commands.append({"op": "draw_polygon", "points": points, "color": color, "width": command["width"]})
        return
    if op == "draw_ellipse":
        x = command["x"] + dx
        y = command["y"] + dy
        if _is_display_surface(dest_surface):
            bridge.draw_ellipse(x, y, command["w"], command["h"], color, command["width"])
        else:
            dest_surface._commands.append(
                {"op": "draw_ellipse", "x": x, "y": y, "w": command["w"], "h": command["h"], "color": color, "width": command["width"]}
            )
        return
    if op == "draw_text":
        x = command["x"] + dx
        y = command["y"] + dy
        if _is_display_surface(dest_surface):
            bridge.draw_text(command["text"], x, y, color, command["size"], command["name"])
        else:
            dest_surface._commands.append(
                {
                    "op": "draw_text",
                    "text": command["text"],
                    "x": x,
                    "y": y,
                    "color": color,
                    "size": command["size"],
                    "name": command["name"],
                }
            )
        return

def _rotate_point(px, py, cx, cy, cos_a, sin_a, tx, ty):
    dx = float(px) - cx
    dy = float(py) - cy
    return (dx * cos_a - dy * sin_a + tx, dx * sin_a + dy * cos_a + ty)

def _rotated_rect_points(x, y, w, h, cx, cy, cos_a, sin_a, tx, ty):
    p1 = _rotate_point(x, y, cx, cy, cos_a, sin_a, tx, ty)
    p2 = _rotate_point(x + w, y, cx, cy, cos_a, sin_a, tx, ty)
    p3 = _rotate_point(x + w, y + h, cx, cy, cos_a, sin_a, tx, ty)
    p4 = _rotate_point(x, y + h, cx, cy, cos_a, sin_a, tx, ty)
    return [[p1[0], p1[1]], [p2[0], p2[1]], [p3[0], p3[1]], [p4[0], p4[1]]]

class _TextSurface:
    def __init__(self, text, color, size=20, name="sans-serif"):
        self.text = str(text)
        self.color = color
        self.size = int(size)
        self.name = str(name)
        # Approximate text metrics for layout-dependent game logic.
        self._width = max(1, int(round(len(self.text) * self.size * 0.6)))
        self._height = max(1, int(round(self.size)))

    def get_width(self):
        return int(self._width)

    def get_height(self):
        return int(self._height)

    def get_size(self):
        return (self.get_width(), self.get_height())

    def get_rect(self, **kwargs):
        rect = Rect(0, 0, self.get_width(), self.get_height())
        for key, value in kwargs.items():
            if hasattr(rect, key):
                setattr(rect, key, value)
        return rect

class Surface:
    def __init__(self, size, flags=0, depth=0, masks=None):
        self.width = int(size[0]) if size else 800
        self.height = int(size[1]) if size else 600
        self.flags = int(flags) if flags is not None else 0
        self.depth = int(depth) if depth is not None else 0
        self.masks = masks
        self._is_display = False
        self._commands = []
        self._alpha = None

    def get_size(self):
        return (int(self.width), int(self.height))

    def get_width(self):
        return int(self.width)

    def get_height(self):
        return int(self.height)

    def copy(self):
        out = Surface((self.width, self.height), self.flags, self.depth, self.masks)
        out._is_display = self._is_display
        out._commands = [_clone_draw_command(command) for command in self._commands]
        out._alpha = self._alpha
        return out

    def convert_alpha(self):
        return self

    def set_alpha(self, alpha):
        self._alpha = None if alpha is None else max(0, min(255, int(alpha)))
        return None

    def get_alpha(self):
        return self._alpha

    def get_rect(self, **kwargs):
        rect = Rect(0, 0, self.width, self.height)
        for key, value in kwargs.items():
            if hasattr(rect, key):
                setattr(rect, key, value)
        return rect

    def fill(self, color, rect=None):
        if rect is None:
            if _is_display_surface(self):
                bridge.clear(color)
            else:
                self._commands = [{"op": "fill_rect", "x": 0, "y": 0, "w": self.width, "h": self.height, "color": color}]
            return Rect(0, 0, self.width, self.height)
        else:
            x, y, w, h = _rect_xywh(rect)
            if _is_display_surface(self):
                bridge.fill_rect(x, y, w, h, color)
            else:
                self._commands.append({"op": "fill_rect", "x": x, "y": y, "w": w, "h": h, "color": color})
            return Rect(x, y, w, h)

    def blit(self, source, dest):
        x, y = _blit_dest_xy(dest)
        if isinstance(source, _TextSurface):
            if _is_display_surface(self):
                bridge.draw_text(source.text, x, y, source.color, source.size, source.name)
            else:
                self._commands.append(
                    {
                        "op": "draw_text",
                        "text": source.text,
                        "x": x,
                        "y": y,
                        "color": source.color,
                        "size": source.size,
                        "name": source.name,
                    }
                )
        elif isinstance(source, Surface):
            for command in source._commands:
                _blit_draw_command(self, command, x, y, source._alpha)
        return dest

class _Display:
    def __init__(self):
        self._surface = Surface((800, 600))
        self._surface._is_display = True
        self._caption = ""

    def set_mode(self, size=(800, 600), flags=0):
        width = int(size[0]) if size else 800
        height = int(size[1]) if size else 600
        bridge.set_canvas_size(width, height)
        self._surface = Surface((width, height))
        self._surface._is_display = True
        return self._surface

    def get_surface(self):
        return self._surface

    def set_caption(self, title):
        self._caption = str(title)
        bridge.set_caption(self._caption)
        return None

    def flip(self):
        bridge.present()

    def update(self):
        bridge.present()

class _Draw:
    def rect(
        self,
        surface,
        color,
        rect,
        width=0,
        border_radius=0,
        border_top_left_radius=-1,
        border_top_right_radius=-1,
        border_bottom_left_radius=-1,
        border_bottom_right_radius=-1,
    ):
        x, y, w, h = _rect_xywh(rect)
        if _is_display_surface(surface):
            bridge.draw_rect(
                x,
                y,
                w,
                h,
                color,
                width,
                border_radius,
                border_top_left_radius,
                border_top_right_radius,
                border_bottom_left_radius,
                border_bottom_right_radius,
            )
        else:
            surface._commands.append(
                {
                    "op": "draw_rect",
                    "x": x,
                    "y": y,
                    "w": w,
                    "h": h,
                    "color": color,
                    "width": width,
                    "border_radius": border_radius,
                    "border_top_left_radius": border_top_left_radius,
                    "border_top_right_radius": border_top_right_radius,
                    "border_bottom_left_radius": border_bottom_left_radius,
                    "border_bottom_right_radius": border_bottom_right_radius,
                }
            )
        return Rect(x, y, w, h)

    def circle(self, surface, color, center, radius, width=0):
        if _is_display_surface(surface):
            bridge.draw_circle(center[0], center[1], radius, color, width)
        else:
            surface._commands.append(
                {"op": "draw_circle", "x": center[0], "y": center[1], "r": radius, "color": color, "width": width}
            )

    def line(self, surface, color, start_pos, end_pos, width=1):
        if _is_display_surface(surface):
            bridge.draw_line(start_pos[0], start_pos[1], end_pos[0], end_pos[1], color, width)
        else:
            surface._commands.append(
                {
                    "op": "draw_line",
                    "x1": start_pos[0],
                    "y1": start_pos[1],
                    "x2": end_pos[0],
                    "y2": end_pos[1],
                    "color": color,
                    "width": width,
                }
            )

    def lines(self, surface, color, closed, points, width=1):
        p = list(points)
        if len(p) < 2:
            return
        for i in range(len(p) - 1):
            self.line(surface, color, p[i], p[i + 1], width)
        if closed:
            self.line(surface, color, p[-1], p[0], width)

    def aaline(self, surface, color, start_pos, end_pos, blend=1):
        self.line(surface, color, start_pos, end_pos, 1)

    def polygon(self, surface, color, points, width=0):
        if _is_display_surface(surface):
            bridge.draw_polygon(list(points), color, width)
        else:
            surface._commands.append({"op": "draw_polygon", "points": [list(p) for p in points], "color": color, "width": width})

    def ellipse(self, surface, color, rect, width=0):
        x, y, w, h = _rect_xywh(rect)
        if _is_display_surface(surface):
            bridge.draw_ellipse(x, y, w, h, color, width)
        else:
            surface._commands.append({"op": "draw_ellipse", "x": x, "y": y, "w": w, "h": h, "color": color, "width": width})

class Event:
    def __init__(self, type, **kwargs):
        self.type = type
        for key, value in kwargs.items():
            setattr(self, key, value)

class _EventModule:
    def __init__(self):
        self._last_keys = set()
        self._last_mouse_pos = (0, 0)
        self._last_mouse_buttons = (False, False, False)

    def get(self):
        if bridge.should_stop():
            raise KeyboardInterrupt("Execution stopped by user")
        if bridge.consume_quit():
            return [Event(pygame.QUIT)]
        raw = bridge.pull_events()
        payload = json.loads(raw) if raw else []
        out = []
        for item in payload:
            event_type = item.pop("type", 0)
            out.append(Event(event_type, **item))

        current_keys = set(bridge.get_keys_down())
        for key in current_keys - self._last_keys:
            out.append(Event(pygame.KEYDOWN, key=key, unicode=(key if len(key) == 1 else "")))
        for key in self._last_keys - current_keys:
            out.append(Event(pygame.KEYUP, key=key))
        self._last_keys = current_keys

        pos_raw = bridge.get_mouse_pos()
        pos = (int(pos_raw[0]), int(pos_raw[1]))
        buttons_raw = bridge.get_mouse_pressed()
        buttons = (bool(buttons_raw[0]), bool(buttons_raw[1]), bool(buttons_raw[2]))

        if pos != self._last_mouse_pos:
            out.append(Event(pygame.MOUSEMOTION, pos=pos))
            self._last_mouse_pos = pos

        for index, (was_pressed, is_pressed) in enumerate(zip(self._last_mouse_buttons, buttons), start=1):
            if is_pressed and not was_pressed:
                out.append(Event(pygame.MOUSEBUTTONDOWN, button=index, pos=pos))
            elif was_pressed and not is_pressed:
                out.append(Event(pygame.MOUSEBUTTONUP, button=index, pos=pos))
        self._last_mouse_buttons = buttons
        return out

class _Clock:
    def __init__(self):
        self._last = bridge.now_ms()

    def tick(self, fps=0):
        if bridge.should_stop():
            raise KeyboardInterrupt("Execution stopped by user")
        current = bridge.now_ms()
        if fps:
            frame_time = 1000.0 / float(fps)
            target = self._last + frame_time
            # In browser runtimes, sleep granularity can be coarse or a no-op.
            # Keep polling until the target frame time to avoid 0ms frame deltas.
            while current < target:
                remaining = target - current
                _time.sleep(min(remaining, 1.0) / 1000.0)
                current = bridge.now_ms()
        delta = current - self._last
        self._last = current
        if fps and delta < 1.0:
            return 1
        return int(delta)

class _TimeModule:
    def __init__(self):
        self._start = bridge.now_ms()

    def Clock(self):
        return _Clock()

    def wait(self, ms):
        _time.sleep(float(ms) / 1000.0)
        return ms

    def delay(self, ms):
        return self.wait(ms)

    def get_ticks(self):
        # Match pygame.time.get_ticks(): milliseconds since time module creation.
        return int(bridge.now_ms() - self._start)

class _FontObj:
    def __init__(self, name, size, bold=False, italic=False):
        self.name = name or "sans-serif"
        self.size = int(size)
        self.bold = bool(bold)
        self.italic = bool(italic)

    def render(self, text, _aa, color):
        return _TextSurface(text, color, self.size, self.name)

class _FontModule:
    def init(self):
        return None

    def SysFont(self, name, size, bold=False, italic=False, *_args, **_kwargs):
        return _FontObj(name, size, bold=bold, italic=italic)

    def Font(self, name, size, *_args, **_kwargs):
        # pygame accepts Font(None, size) for the default font.
        return _FontObj(name if name is not None else "sans-serif", size)

class _TransformModule:
    def _surface_size(self, surface):
        if hasattr(surface, "get_size"):
            size = surface.get_size()
            return (max(1, int(size[0])), max(1, int(size[1])))
        return (max(1, int(getattr(surface, "width", 1))), max(1, int(getattr(surface, "height", 1))))

    def _new_surface_like(self, source, width, height):
        return Surface(
            (max(1, int(width)), max(1, int(height))),
            getattr(source, "flags", 0),
            getattr(source, "depth", 0),
            getattr(source, "masks", None),
        )

    def scale(self, surface, size, dest_surface=None):
        w, h = int(size[0]), int(size[1])
        out = self._new_surface_like(surface, w, h)
        return dest_surface if dest_surface is not None else out

    def smoothscale(self, surface, size, dest_surface=None):
        return self.scale(surface, size, dest_surface)

    def scale_by(self, surface, factor):
        sw, sh = self._surface_size(surface)
        if hasattr(factor, "__len__"):
            fx, fy = float(factor[0]), float(factor[1])
        else:
            fx = fy = float(factor)
        return self._new_surface_like(surface, int(round(sw * fx)), int(round(sh * fy)))

    def rotate(self, surface, angle):
        sw, sh = self._surface_size(surface)
        # pygame.transform.rotate uses positive angles as counter-clockwise;
        # in screen-space (y down), we mirror that by negating the math angle.
        radians = math.radians(-float(angle))
        sin_signed = math.sin(radians)
        cos_signed = math.cos(radians)
        cos_a = abs(cos_signed)
        sin_a = abs(sin_signed)
        new_w = int(round(sw * cos_a + sh * sin_a))
        new_h = int(round(sw * sin_a + sh * cos_a))
        out = self._new_surface_like(surface, new_w, new_h)
        out._alpha = getattr(surface, "_alpha", None)
        commands = list(getattr(surface, "_commands", []))
        if not commands:
            return out

        src_cx = sw / 2.0
        src_cy = sh / 2.0
        dst_cx = new_w / 2.0
        dst_cy = new_h / 2.0
        for command in commands:
            op = command.get("op")
            if op in {"fill_rect", "draw_rect"}:
                points = _rotated_rect_points(
                    command["x"],
                    command["y"],
                    command["w"],
                    command["h"],
                    src_cx,
                    src_cy,
                    cos_signed,
                    sin_signed,
                    dst_cx,
                    dst_cy,
                )
                out._commands.append(
                    {
                        "op": "draw_polygon",
                        "points": points,
                        "color": command["color"],
                        "width": command["width"] if op == "draw_rect" else 0,
                    }
                )
                continue
            if op == "draw_polygon":
                rotated_points = []
                for point in command["points"]:
                    rx, ry = _rotate_point(point[0], point[1], src_cx, src_cy, cos_signed, sin_signed, dst_cx, dst_cy)
                    rotated_points.append([rx, ry])
                out._commands.append(
                    {
                        "op": "draw_polygon",
                        "points": rotated_points,
                        "color": command["color"],
                        "width": command["width"],
                    }
                )
                continue
            if op == "draw_line":
                x1, y1 = _rotate_point(command["x1"], command["y1"], src_cx, src_cy, cos_signed, sin_signed, dst_cx, dst_cy)
                x2, y2 = _rotate_point(command["x2"], command["y2"], src_cx, src_cy, cos_signed, sin_signed, dst_cx, dst_cy)
                out._commands.append(
                    {
                        "op": "draw_line",
                        "x1": x1,
                        "y1": y1,
                        "x2": x2,
                        "y2": y2,
                        "color": command["color"],
                        "width": command["width"],
                    }
                )
                continue
            if op == "draw_circle":
                cx, cy = _rotate_point(command["x"], command["y"], src_cx, src_cy, cos_signed, sin_signed, dst_cx, dst_cy)
                out._commands.append(
                    {"op": "draw_circle", "x": cx, "y": cy, "r": command["r"], "color": command["color"], "width": command["width"]}
                )
                continue
            if op == "draw_ellipse":
                cx = command["x"] + command["w"] / 2.0
                cy = command["y"] + command["h"] / 2.0
                rcx, rcy = _rotate_point(cx, cy, src_cx, src_cy, cos_signed, sin_signed, dst_cx, dst_cy)
                out._commands.append(
                    {
                        "op": "draw_ellipse",
                        "x": rcx - command["w"] / 2.0,
                        "y": rcy - command["h"] / 2.0,
                        "w": command["w"],
                        "h": command["h"],
                        "color": command["color"],
                        "width": command["width"],
                    }
                )
                continue
        return out

    def rotozoom(self, surface, angle, scale):
        rotated = self.rotate(surface, angle)
        factor = float(scale)
        rw, rh = self._surface_size(rotated)
        return self._new_surface_like(rotated, int(round(rw * factor)), int(round(rh * factor)))

    def flip(self, surface, flip_x, flip_y):
        _ = bool(flip_x) or bool(flip_y)
        return surface.copy() if hasattr(surface, "copy") else self._new_surface_like(surface, *self._surface_size(surface))

class _MouseModule:
    def get_pos(self):
        pos = bridge.get_mouse_pos()
        return (int(pos[0]), int(pos[1]))

    def get_pressed(self, num_buttons=3):
        pressed = bridge.get_mouse_pressed()
        buttons = (bool(pressed[0]), bool(pressed[1]), bool(pressed[2]))
        count = max(0, int(num_buttons))
        if count <= 0:
            return ()
        if count <= 3:
            return buttons[:count]
        return buttons + tuple(False for _ in range(count - 3))

class _KeyState:
    def __init__(self, keys):
        self._keys = set(keys)

    def __getitem__(self, key):
        return key in self._keys

    def get(self, key, default=False):
        return key in self._keys if key is not None else default

    def __contains__(self, key):
        return key in self._keys

class _KeyModule:
    def get_pressed(self):
        return _KeyState(bridge.get_keys_down())

    def name(self, key):
        return str(key)

class _EventFactory:
    def Event(self, t, **kwargs):
        return Event(t, **kwargs)

def _is_group_like(value):
    return hasattr(value, "add") and hasattr(value, "remove")

def _is_iterable_container(value):
    if value is None:
        return False
    if isinstance(value, (str, bytes, bytearray)):
        return False
    return hasattr(value, "__iter__")

def _iter_sprites(values):
    for value in values:
        if hasattr(value, "_sprites"):
            for sprite in value._sprites:
                yield sprite
        elif _is_iterable_container(value):
            for sprite in _iter_sprites(value):
                yield sprite
        else:
            yield value

def _iter_groups(values):
    for value in values:
        if _is_group_like(value):
            yield value
        elif _is_iterable_container(value):
            for group in _iter_groups(value):
                yield group

class Sprite:
    def __init__(self, *groups):
        self.image = None
        self.rect = Rect(0, 0, 0, 0)
        self._groups = set()
        if groups:
            self.add(*groups)

    def add(self, *groups):
        for group in _iter_groups(groups):
            if hasattr(group, "add"):
                group.add(self)
        return None

    def remove(self, *groups):
        for group in _iter_groups(groups):
            if hasattr(group, "remove"):
                group.remove(self)
        return None

    def kill(self):
        for group in list(self._groups):
            group.remove(self)
        return None

    def groups(self):
        return list(self._groups)

    def alive(self):
        return bool(self._groups)

    def update(self, *args, **kwargs):
        return None

class Group:
    def __init__(self, *sprites):
        self._sprites = []
        if sprites:
            self.add(*sprites)

    def add(self, *sprites):
        for sprite in _iter_sprites(sprites):
            if sprite is None:
                continue
            if sprite not in self._sprites:
                self._sprites.append(sprite)
                if not hasattr(sprite, "_groups"):
                    sprite._groups = set()
                sprite._groups.add(self)
        return None

    def remove(self, *sprites):
        for sprite in _iter_sprites(sprites):
            if sprite in self._sprites:
                self._sprites.remove(sprite)
                groups = getattr(sprite, "_groups", None)
                if groups is not None:
                    groups.discard(self)
        return None

    def has(self, *sprites):
        return all(sprite in self._sprites for sprite in _iter_sprites(sprites))

    def empty(self):
        self.remove(list(self._sprites))
        return None

    def copy(self):
        out = Group()
        out.add(self._sprites)
        return out

    def sprites(self):
        return list(self._sprites)

    def update(self, *args, **kwargs):
        for sprite in list(self._sprites):
            update = getattr(sprite, "update", None)
            if callable(update):
                update(*args, **kwargs)
        return None

    def draw(self, surface):
        drawn = []
        for sprite in self._sprites:
            image = getattr(sprite, "image", None)
            rect = getattr(sprite, "rect", None)
            if image is None or rect is None:
                continue
            dest = rect.topleft if hasattr(rect, "topleft") else rect
            surface.blit(image, dest)
            if isinstance(rect, Rect):
                drawn.append(Rect(rect.x, rect.y, rect.width, rect.height))
            else:
                drawn.append(rect)
        return drawn

    def __contains__(self, sprite):
        return sprite in self._sprites

    def __iter__(self):
        return iter(self._sprites)

    def __len__(self):
        return len(self._sprites)

def collide_rect(left, right):
    left_rect = getattr(left, "rect", left)
    right_rect = getattr(right, "rect", right)
    return Rect(*_rect_xywh(left_rect)).colliderect(right_rect)

def spritecollide(sprite, group, dokill=False, collided=None):
    collide = collided or collide_rect
    matches = [candidate for candidate in group.sprites() if collide(sprite, candidate)]
    if dokill:
        for candidate in matches:
            candidate.kill()
    return matches

def spritecollideany(sprite, group, collided=None):
    collide = collided or collide_rect
    for candidate in group.sprites():
        if collide(sprite, candidate):
            return candidate
    return None

def groupcollide(group_a, group_b, dokill_a=False, dokill_b=False, collided=None):
    collide = collided or collide_rect
    out = {}
    for sprite_a in group_a.sprites():
        hits = [sprite_b for sprite_b in group_b.sprites() if collide(sprite_a, sprite_b)]
        if hits:
            out[sprite_a] = hits
            if dokill_a:
                sprite_a.kill()
            if dokill_b:
                for sprite_b in hits:
                    sprite_b.kill()
    return out

def _install_key_constants(module):
    base = {
        "K_ESCAPE": "Escape",
        "K_SPACE": " ",
        "K_RETURN": "Enter",
        "K_ENTER": "Enter",
        "K_TAB": "Tab",
        "K_BACKSPACE": "Backspace",
        "K_DELETE": "Delete",
        "K_INSERT": "Insert",
        "K_HOME": "Home",
        "K_END": "End",
        "K_PAGEUP": "PageUp",
        "K_PAGEDOWN": "PageDown",
        "K_LEFT": "ArrowLeft",
        "K_RIGHT": "ArrowRight",
        "K_UP": "ArrowUp",
        "K_DOWN": "ArrowDown",
        "K_LSHIFT": "Shift",
        "K_RSHIFT": "Shift",
        "K_LCTRL": "Control",
        "K_RCTRL": "Control",
        "K_LALT": "Alt",
        "K_RALT": "Alt",
        "K_LMETA": "Meta",
        "K_RMETA": "Meta",
        "K_MINUS": "-",
        "K_EQUALS": "=",
        "K_LEFTBRACKET": "[",
        "K_RIGHTBRACKET": "]",
        "K_BACKSLASH": "\\\\",
        "K_SEMICOLON": ";",
        "K_QUOTE": "'",
        "K_COMMA": ",",
        "K_PERIOD": ".",
        "K_SLASH": "/",
        "K_BACKQUOTE": "\`",
    }
    for name, value in base.items():
        setattr(module, name, value)

    for ch in _string.ascii_lowercase:
        setattr(module, f"K_{ch}", ch)
    for digit in _string.digits:
        setattr(module, f"K_{digit}", digit)
    for index in range(1, 13):
        setattr(module, f"K_F{index}", f"F{index}")

pygame = types.ModuleType("pygame")
pygame.QUIT = 256
pygame.KEYDOWN = 768
pygame.KEYUP = 769
pygame.MOUSEMOTION = 1024
pygame.MOUSEBUTTONDOWN = 1025
pygame.MOUSEBUTTONUP = 1026
pygame.FULLSCREEN = 1
pygame.SRCALPHA = 65536
pygame.Rect = Rect
pygame.Vector2 = Vector2
pygame.Surface = Surface
pygame.display = _Display()
pygame.draw = _Draw()
pygame.event = _EventModule()
pygame.time = _TimeModule()
pygame.font = _FontModule()
pygame.transform = _TransformModule()
pygame.mouse = _MouseModule()
pygame.key = _KeyModule()
_install_key_constants(pygame)
pygame.event = _EventModule()
pygame.event.Event = _EventFactory().Event
pygame.init = lambda: (0, 0)
pygame.quit = lambda: None
pygame.Color = lambda *c: c

pygame_math = types.ModuleType("pygame.math")
pygame_math.Vector2 = Vector2
pygame.math = pygame_math

pygame_sprite = types.ModuleType("pygame.sprite")
pygame_sprite.Sprite = Sprite
pygame_sprite.Group = Group
pygame_sprite.RenderPlain = Group
pygame_sprite.RenderUpdates = Group
pygame_sprite.collide_rect = collide_rect
pygame_sprite.spritecollide = spritecollide
pygame_sprite.spritecollideany = spritecollideany
pygame_sprite.groupcollide = groupcollide
pygame.sprite = pygame_sprite

class _Screen:
    def setup(self, width=800, height=600):
        bridge.set_canvas_size(int(width), int(height))

    def title(self, title):
        bridge.set_caption(str(title))

    def bgcolor(self, color):
        bridge.clear(color)

    def clearscreen(self):
        bridge.clear("black")

    def mainloop(self):
        return None

class _Turtle:
    def __init__(self):
        self._x = 0.0
        self._y = 0.0
        self._heading = 0.0
        self._pen = True
        self._color = "white"
        self._size = 2
        self._fill_active = False
        self._fill_points = []
        self._fill_color = "white"

    def _to_px(self, x, y):
        w, h = bridge.get_canvas_size()
        return (w / 2.0 + float(x), h / 2.0 - float(y))

    def speed(self, _v):
        return None

    def pencolor(self, color):
        self._color = color

    def color(self, *args):
        if len(args) == 1:
            self._color = args[0]
            self._fill_color = args[0]
        elif len(args) == 3:
            self._color = (args[0], args[1], args[2])
            self._fill_color = (args[0], args[1], args[2])
        return self._color

    def fillcolor(self, *args):
        if len(args) == 1:
            self._fill_color = args[0]
        elif len(args) == 3:
            self._fill_color = (args[0], args[1], args[2])
        return self._fill_color

    def pensize(self, size):
        self._size = float(size)

    def width(self, size):
        self.pensize(size)

    def penup(self):
        self._pen = False

    def pendown(self):
        self._pen = True

    def goto(self, x, y):
        x = float(x)
        y = float(y)
        if self._pen:
            x1, y1 = self._to_px(self._x, self._y)
            x2, y2 = self._to_px(x, y)
            bridge.draw_line(x1, y1, x2, y2, self._color, self._size)
        self._x = x
        self._y = y
        if self._fill_active:
            self._fill_points.append((x, y))

    def setpos(self, x, y):
        self.goto(x, y)

    def setx(self, x):
        self.goto(x, self._y)

    def sety(self, y):
        self.goto(self._x, y)

    def xcor(self):
        return self._x

    def ycor(self):
        return self._y

    def position(self):
        return (self._x, self._y)

    def heading(self):
        return self._heading

    def forward(self, distance):
        r = math.radians(self._heading)
        nx = self._x + math.cos(r) * float(distance)
        ny = self._y + math.sin(r) * float(distance)
        self.goto(nx, ny)

    def fd(self, distance):
        self.forward(distance)

    def backward(self, distance):
        self.forward(-float(distance))

    def bk(self, distance):
        self.backward(distance)

    def right(self, angle):
        self._heading -= float(angle)

    def left(self, angle):
        self._heading += float(angle)

    def setheading(self, heading):
        self._heading = float(heading)

    def home(self):
        self.goto(0, 0)
        self._heading = 0

    def begin_fill(self):
        self._fill_active = True
        self._fill_points = [(self._x, self._y)]

    def end_fill(self):
        if self._fill_active and len(self._fill_points) >= 3:
            points = [self._to_px(px, py) for px, py in self._fill_points]
            bridge.draw_polygon(points, self._fill_color, 0)
        self._fill_active = False
        self._fill_points = []

    def hideturtle(self):
        return None

    def showturtle(self):
        return None

    def dot(self, size=6, color=None):
        x, y = self._to_px(self._x, self._y)
        bridge.draw_circle(x, y, float(size) / 2.0, color or self._color, 0)

    def circle(self, radius, extent=360, steps=None):
        steps = int(steps) if steps else max(12, int(abs(radius) * abs(extent) / 15))
        if steps <= 1:
            return
        direction = 1 if extent >= 0 else -1
        step_angle = float(extent) / steps
        step_len = 2.0 * math.pi * abs(float(radius)) * (abs(step_angle) / 360.0)
        turn = step_angle * direction
        for _ in range(steps):
            self.left(turn)
            self.forward(step_len)

def Screen():
    return _Screen()

def clearscreen():
    bridge.clear("black")

_main_turtle = _Turtle()

def Turtle():
    return _Turtle()

def done():
    return None

def forward(d): _main_turtle.forward(d)
def fd(d): _main_turtle.fd(d)
def backward(d): _main_turtle.backward(d)
def bk(d): _main_turtle.bk(d)
def right(a): _main_turtle.right(a)
def left(a): _main_turtle.left(a)
def goto(x, y): _main_turtle.goto(x, y)
def setpos(x, y): _main_turtle.setpos(x, y)
def setx(x): _main_turtle.setx(x)
def sety(y): _main_turtle.sety(y)
def xcor(): return _main_turtle.xcor()
def ycor(): return _main_turtle.ycor()
def position(): return _main_turtle.position()
def heading(): return _main_turtle.heading()
def penup(): _main_turtle.penup()
def pendown(): _main_turtle.pendown()
def color(*args): return _main_turtle.color(*args)
def pencolor(c): _main_turtle.pencolor(c)
def pensize(s): _main_turtle.pensize(s)
def width(s): _main_turtle.width(s)
def setheading(h): _main_turtle.setheading(h)
def home(): _main_turtle.home()
def circle(r, extent=360, steps=None): _main_turtle.circle(r, extent, steps)
def dot(size=6, color=None): _main_turtle.dot(size, color)

turtle = types.ModuleType("turtle")
for _name, _value in list(globals().items()):
    if _name in {
        "Screen", "Turtle", "done", "forward", "fd", "backward", "bk",
        "right", "left", "goto", "setpos", "setx", "sety", "xcor", "ycor",
        "position", "heading", "penup", "pendown", "color", "pencolor",
        "pensize", "width", "setheading", "home", "circle", "clearscreen", "dot"
    }:
        setattr(turtle, _name, _value)

pygame_locals = types.ModuleType("pygame.locals")
for _name in dir(pygame):
    if _name.isupper():
        setattr(pygame_locals, _name, getattr(pygame, _name))

sys.modules["pygame"] = pygame
sys.modules["pygame.locals"] = pygame_locals
sys.modules["pygame.math"] = pygame_math
sys.modules["pygame.sprite"] = pygame_sprite
sys.modules["turtle"] = turtle
`

type PyodideInstance = {
  registerJsModule: (name: string, module: Record<string, unknown>) => void
  runPythonAsync: (code: string) => Promise<unknown>
}

let pyodide: PyodideInstance | null = null
let pyodideReadyPromise: Promise<PyodideInstance> | null = null
let bootstrapLoaded = false
let stopRequested = false
let mousePos: [number, number] = [0, 0]
let mouseButtons: [number, number, number] = [0, 0, 0]
const keysDown = new Set<string>()
let sharedInputView: Int32Array | null = null
let canvasSize: [number, number] = [900, 560]
let eventQueue: RuntimeEvent[] = []
let drawBuffer: DrawCommand[] = []
let lastFlushTs = 0
let bufferStartedTs = 0

const post = (message: WorkerOutboundMessage) => self.postMessage(message)

const hasToJs = (value: unknown): value is { toJs: (...args: unknown[]) => unknown } =>
  value !== null &&
  typeof value === 'object' &&
  'toJs' in value &&
  typeof (value as { toJs?: unknown }).toJs === 'function'

const hasDestroy = (value: unknown): value is { destroy: () => void } =>
  value !== null &&
  typeof value === 'object' &&
  'destroy' in value &&
  typeof (value as { destroy?: unknown }).destroy === 'function'

const toPlainJs = (value: unknown, depth = 0): unknown => {
  if (depth > 6) {
    return null
  }
  if (value == null) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  let current: unknown = value
  if (hasToJs(current)) {
    try {
      current = current.toJs()
    } finally {
      if (hasDestroy(value)) {
        value.destroy()
      }
    }
  }

  if (Array.isArray(current)) {
    return current.map((entry) => toPlainJs(entry, depth + 1))
  }

  if (current && typeof current === 'object') {
    const output: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(current as Record<string, unknown>)) {
      output[key] = toPlainJs(val, depth + 1)
    }
    return output
  }

  return String(current)
}

const pushEvent = (event: RuntimeEvent) => {
  if (event.type === 1024) {
    const last = eventQueue[eventQueue.length - 1]
    if (last && last.type === 1024) {
      eventQueue[eventQueue.length - 1] = event
    } else {
      eventQueue.push(event)
    }
  } else {
    eventQueue.push(event)
  }
  if (eventQueue.length > MAX_EVENT_QUEUE) {
    eventQueue.splice(0, eventQueue.length - MAX_EVENT_QUEUE)
  }
}

const toMouseIndex = (button: number | undefined): number => {
  // Accept both pygame-style [1,2,3] and browser-style [0,1,2] button ids.
  if (button === 1 || button === 0) return 0
  if (button === 2) return 1
  if (button === 3) return 2
  return -1
}

const getSharedMousePos = (): [number, number] | null => {
  if (!sharedInputView) return null
  return [
    Atomics.load(sharedInputView, SHARED_INPUT_INDEX.mouseX),
    Atomics.load(sharedInputView, SHARED_INPUT_INDEX.mouseY),
  ]
}

const getSharedMouseButtons = (): [number, number, number] | null => {
  if (!sharedInputView) return null
  return [
    Atomics.load(sharedInputView, SHARED_INPUT_INDEX.mouseLeft),
    Atomics.load(sharedInputView, SHARED_INPUT_INDEX.mouseMiddle),
    Atomics.load(sharedInputView, SHARED_INPUT_INDEX.mouseRight),
  ]
}

const getSharedKeysDown = (): string[] | null => {
  if (!sharedInputView) return null
  const down: string[] = []
  for (let index = 0; index < SHARED_PYGAME_KEYS.length; index += 1) {
    const slot = SHARED_INPUT_INDEX.keysStart + index
    if (Atomics.load(sharedInputView, slot) > 0) {
      down.push(SHARED_PYGAME_KEYS[index])
    }
  }
  return down
}

const consumeSharedQuit = (): boolean => {
  if (!sharedInputView) return false
  return Atomics.exchange(sharedInputView, SHARED_INPUT_INDEX.quitRequested, 0) === 1
}

const flushDrawBuffer = (force = false) => {
  const now = performance.now()
  if (!force && drawBuffer.length === 0) {
    return
  }
  if (!force && drawBuffer.length > 0 && drawBuffer[0].op === 'clear') {
    const bufferedForMs = now - bufferStartedTs
    // A clear commonly marks the start of a pygame frame. Give draw calls a brief
    // window to batch until flip()/present arrives to avoid split-frame flashing.
    if (drawBuffer.length < 64 && bufferedForMs < 28) {
      return
    }
  }
  if (!force && now - lastFlushTs < FLUSH_INTERVAL_MS && drawBuffer.length < 180) {
    return
  }
  if (drawBuffer.length > 0) {
    post({ type: 'drawBatch', commands: drawBuffer })
    drawBuffer = []
    lastFlushTs = now
    bufferStartedTs = 0
  }
}

const queueDrawCommand = (command: DrawCommand, highPriority = false) => {
  if (drawBuffer.length === 0) {
    bufferStartedTs = performance.now()
  }
  drawBuffer.push(command)
  if (highPriority || drawBuffer.length >= MAX_BUFFERED_COMMANDS) {
    flushDrawBuffer(true)
  } else {
    flushDrawBuffer(false)
  }
}

const loadPyodideRuntime = async (): Promise<PyodideInstance> => {
  if (pyodide) return pyodide
  if (!pyodideReadyPromise) {
    pyodideReadyPromise = (async () => {
      post({ type: 'status', message: 'Loading Python runtime...' })
      self.importScripts(`${PYODIDE_INDEX_URL}pyodide.js`)
      if (!self.loadPyodide) {
        throw new Error('Pyodide failed to load in worker.')
      }
      const next = (await self.loadPyodide({
        indexURL: PYODIDE_INDEX_URL,
        stdout: (message) => post({ type: 'stdout', message }),
        stderr: (message) => post({ type: 'stderr', message }),
      })) as PyodideInstance

      next.registerJsModule('emulator_bridge', {
        set_canvas_size: (width: number, height: number) => {
          const nextW = Math.max(64, Math.floor(width))
          const nextH = Math.max(64, Math.floor(height))
          if (nextW === canvasSize[0] && nextH === canvasSize[1]) return
          canvasSize = [nextW, nextH]
          queueDrawCommand({ op: 'setCanvasSize', width: nextW, height: nextH }, true)
        },
        get_canvas_size: () => canvasSize,
        set_caption: (title: string) => {
          post({ type: 'status', message: `Window title: ${title}` })
        },
        // Keep per-frame clears batched with subsequent draw ops; pygame.present/flip flushes explicitly.
        clear: (color: unknown) => queueDrawCommand({ op: 'clear', color: toPlainJs(color) }),
        fill_rect: (x: number, y: number, w: number, h: number, color: unknown) => {
          queueDrawCommand({ op: 'fillRect', x, y, w, h, color: toPlainJs(color) })
        },
        draw_rect: (
          x: number,
          y: number,
          w: number,
          h: number,
          color: unknown,
          width: number,
          borderRadius = 0,
          borderTopLeftRadius = -1,
          borderTopRightRadius = -1,
          borderBottomLeftRadius = -1,
          borderBottomRightRadius = -1,
        ) => {
          queueDrawCommand({
            op: 'drawRect',
            x,
            y,
            w,
            h,
            color: toPlainJs(color),
            width,
            borderRadius,
            borderTopLeftRadius,
            borderTopRightRadius,
            borderBottomLeftRadius,
            borderBottomRightRadius,
          })
        },
        draw_circle: (x: number, y: number, r: number, color: unknown, width: number) => {
          queueDrawCommand({ op: 'drawCircle', x, y, r, color: toPlainJs(color), width })
        },
        draw_line: (
          x1: number,
          y1: number,
          x2: number,
          y2: number,
          color: unknown,
          width: number,
        ) => {
          queueDrawCommand({ op: 'drawLine', x1, y1, x2, y2, color: toPlainJs(color), width })
        },
        draw_text: (
          text: string,
          x: number,
          y: number,
          color: unknown,
          size: number,
          family: string,
        ) => {
          queueDrawCommand({ op: 'drawText', text, x, y, color: toPlainJs(color), size, family })
        },
        draw_ellipse: (x: number, y: number, w: number, h: number, color: unknown, width: number) => {
          queueDrawCommand({ op: 'drawEllipse', x, y, w, h, color: toPlainJs(color), width })
        },
        draw_polygon: (points: Array<[number, number]>, color: unknown, width: number) => {
          const normalizedPoints = toPlainJs(points)
          queueDrawCommand({
            op: 'drawPolygon',
            points: (Array.isArray(normalizedPoints) ? normalizedPoints : []) as Array<[number, number]>,
            color: toPlainJs(color),
            width,
          })
        },
        present: () => flushDrawBuffer(true),
        pull_events: () => {
          const payload = JSON.stringify(eventQueue)
          eventQueue = []
          return payload
        },
        get_mouse_pos: () => getSharedMousePos() ?? mousePos,
        get_mouse_pressed: () => {
          const shared = getSharedMouseButtons()
          if (!shared) return mouseButtons
          // Prefer shared state but keep a mirrored fallback path in case shared
          // input lags in some browser runtimes.
          return [
            shared[0] > 0 || mouseButtons[0] > 0 ? 1 : 0,
            shared[1] > 0 || mouseButtons[1] > 0 ? 1 : 0,
            shared[2] > 0 || mouseButtons[2] > 0 ? 1 : 0,
          ]
        },
        get_keys_down: () => getSharedKeysDown() ?? Array.from(keysDown),
        consume_quit: () => consumeSharedQuit(),
        now_ms: () => performance.now(),
        should_stop: () => stopRequested,
      })

      post({ type: 'status', message: 'Python runtime ready.' })
      return next
    })()
  }
  pyodide = await pyodideReadyPromise
  return pyodide
}

const ensureBootstrap = async () => {
  const runtime = await loadPyodideRuntime()
  if (!bootstrapLoaded) {
    await runtime.runPythonAsync(PY_EMULATOR_BOOTSTRAP)
    bootstrapLoaded = true
    post({ type: 'status', message: 'Emulator modules loaded.' })
  }
}

const runCode = async (code: string) => {
  stopRequested = false
  keysDown.clear()
  eventQueue = []
  mouseButtons = [0, 0, 0]
  await ensureBootstrap()
  try {
    const runtime = await loadPyodideRuntime()
    post({ type: 'runStarted' })
    await runtime.runPythonAsync(code)
    flushDrawBuffer(true)
    post({ type: 'runDone' })
  } catch (error) {
    flushDrawBuffer(true)
    const message = error instanceof Error ? error.message : String(error)
    post({ type: 'runError', message })
  }
}

self.onmessage = (event: MessageEvent<WorkerInboundMessage>) => {
  const message = event.data
  if (!message) return

  if (message.type === 'setSharedInput') {
    sharedInputView = new Int32Array(message.buffer)
    return
  }

  if (message.type === 'warmup') {
    ensureBootstrap()
      .then(() => post({ type: 'runtimeReady' }))
      .catch((error) => {
        const msg = error instanceof Error ? error.message : String(error)
        post({ type: 'runError', message: msg })
      })
    return
  }

  if (message.type === 'run') {
    runCode(message.code)
    return
  }

  if (message.type === 'stop') {
    stopRequested = true
    return
  }

  if (message.type === 'clearCanvas') {
    queueDrawCommand({ op: 'clear', color: message.color }, true)
    return
  }

  if (message.type === 'enqueueEvents') {
    for (const runtimeEvent of message.events) {
      if (runtimeEvent.type === 768 && runtimeEvent.key) {
        keysDown.add(runtimeEvent.key)
      } else if (runtimeEvent.type === 769 && runtimeEvent.key) {
        keysDown.delete(runtimeEvent.key)
      } else if (runtimeEvent.type === 1025) {
        const index = toMouseIndex(runtimeEvent.button)
        if (index >= 0) mouseButtons[index] = 1
      } else if (runtimeEvent.type === 1026) {
        const index = toMouseIndex(runtimeEvent.button)
        if (index >= 0) mouseButtons[index] = 0
      }
      pushEvent(runtimeEvent)
    }
    return
  }

  if (message.type === 'setMousePos') {
    mousePos = message.pos
    return
  }

  if (message.type === 'setMouseButtons') {
    mouseButtons = [
      message.buttons[0] > 0 ? 1 : 0,
      message.buttons[1] > 0 ? 1 : 0,
      message.buttons[2] > 0 ? 1 : 0,
    ]
  }
}
