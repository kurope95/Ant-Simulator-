#pragma once

#include "core/vec2.hpp"

namespace antsim::core {

struct Rect {
    Vec2 min, max;
};

constexpr bool contains(const Rect& r, Vec2 p) {
    return p.x >= r.min.x && p.x <= r.max.x && p.y >= r.min.y && p.y <= r.max.y;
}

constexpr bool intersects(const Rect& a, const Rect& b) {
    return a.min.x <= b.max.x && b.min.x <= a.max.x && a.min.y <= b.max.y && b.min.y <= a.max.y;
}

constexpr Rect expanded(const Rect& r, float margin) {
    return {{r.min.x - margin, r.min.y - margin}, {r.max.x + margin, r.max.y + margin}};
}

}  // namespace antsim::core
