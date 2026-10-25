#pragma once

#include <cmath>

namespace antsim::core {

struct Vec2 {
    float x = 0.f, y = 0.f;
};

constexpr Vec2 operator+(Vec2 a, Vec2 b) { return {a.x + b.x, a.y + b.y}; }
constexpr Vec2 operator-(Vec2 a, Vec2 b) { return {a.x - b.x, a.y - b.y}; }
constexpr Vec2 operator-(Vec2 v) { return {-v.x, -v.y}; }
constexpr Vec2 operator*(Vec2 v, float s) { return {v.x * s, v.y * s}; }
constexpr Vec2 operator*(float s, Vec2 v) { return {v.x * s, v.y * s}; }
constexpr Vec2 operator/(Vec2 v, float s) { return {v.x / s, v.y / s}; }
constexpr Vec2& operator+=(Vec2& a, Vec2 b) { a.x += b.x; a.y += b.y; return a; }
constexpr Vec2& operator-=(Vec2& a, Vec2 b) { a.x -= b.x; a.y -= b.y; return a; }
constexpr Vec2& operator*=(Vec2& a, float s) { a.x *= s; a.y *= s; return a; }
constexpr bool operator==(Vec2 a, Vec2 b) { return a.x == b.x && a.y == b.y; }
constexpr bool operator!=(Vec2 a, Vec2 b) { return !(a == b); }

constexpr float dot(Vec2 a, Vec2 b) { return a.x * b.x + a.y * b.y; }
constexpr float cross(Vec2 a, Vec2 b) { return a.x * b.y - a.y * b.x; }
constexpr float length_sq(Vec2 v) { return dot(v, v); }
inline float length(Vec2 v) { return std::sqrt(length_sq(v)); }

inline Vec2 normalized(Vec2 v) {
    const float len = length(v);
    return len > 0.f ? v / len : Vec2{};
}

constexpr Vec2 perp(Vec2 v) { return {-v.y, v.x}; }

inline Vec2 rotated(Vec2 v, float radians) {
    const float c = std::cos(radians);
    const float s = std::sin(radians);
    return {v.x * c - v.y * s, v.x * s + v.y * c};
}

inline Vec2 from_angle(float radians) { return {std::cos(radians), std::sin(radians)}; }
inline float angle_of(Vec2 v) { return std::atan2(v.y, v.x); }

constexpr Vec2 lerp(Vec2 a, Vec2 b, float t) { return {a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t}; }

}  // namespace antsim::core
