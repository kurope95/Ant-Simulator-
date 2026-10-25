#include <doctest/doctest.h>

#include "core/color.hpp"
#include "core/math.hpp"
#include "core/rect.hpp"
#include "core/vec2.hpp"

using namespace antsim::core;

TEST_CASE("math: vec2 arithmetic and helpers") {
    CHECK(Vec2{1.f, 2.f} + Vec2{3.f, 4.f} == Vec2{4.f, 6.f});
    CHECK(Vec2{1.f, 2.f} * 2.f == Vec2{2.f, 4.f});
    CHECK(2.f * Vec2{1.f, 2.f} == Vec2{2.f, 4.f});
    CHECK(-Vec2{1.f, -2.f} == Vec2{-1.f, 2.f});
    CHECK(length(Vec2{3.f, 4.f}) == doctest::Approx(5.f));
    CHECK(length_sq(Vec2{3.f, 4.f}) == doctest::Approx(25.f));
    CHECK(dot(Vec2{1.f, 2.f}, Vec2{3.f, 4.f}) == doctest::Approx(11.f));
    CHECK(cross(Vec2{1.f, 0.f}, Vec2{0.f, 1.f}) == doctest::Approx(1.f));
    CHECK(normalized(Vec2{0.f, 0.f}) == Vec2{0.f, 0.f});          // zero stays zero
    CHECK(normalized(Vec2{10.f, 0.f}).x == doctest::Approx(1.f));
    CHECK(perp(Vec2{1.f, 0.f}) == Vec2{0.f, 1.f});                 // {-y, x}
    const Vec2 r = rotated(Vec2{1.f, 0.f}, kPi / 2.f);
    CHECK(r.x == doctest::Approx(0.f));
    CHECK(r.y == doctest::Approx(1.f));
    CHECK(from_angle(0.f).x == doctest::Approx(1.f));
    CHECK(angle_of(Vec2{0.f, 1.f}) == doctest::Approx(kPi / 2.f));
    const Vec2 l = lerp(Vec2{0.f, 0.f}, Vec2{10.f, 20.f}, 0.25f);
    CHECK(l.x == doctest::Approx(2.5f));
    CHECK(l.y == doctest::Approx(5.f));
}

TEST_CASE("math: angles wrap into (-pi, pi]") {
    CHECK(wrap_angle(3.f * kPi) == doctest::Approx(kPi));
    CHECK(wrap_angle(-kPi) == doctest::Approx(kPi));
    CHECK(wrap_angle(-1.5f * kPi) == doctest::Approx(0.5f * kPi));
    CHECK(wrap_angle(0.25f) == doctest::Approx(0.25f));
    CHECK(angle_diff(0.1f, -0.1f) == doctest::Approx(-0.2f));
    CHECK(angle_diff(kPi - 0.1f, -kPi + 0.1f) == doctest::Approx(0.2f));   // across the seam
}

TEST_CASE("math: scalar helpers") {
    CHECK(lerp(2.f, 4.f, 0.5f) == doctest::Approx(3.f));
    CHECK(smoothstep(-1.f) == 0.f);
    CHECK(smoothstep(0.5f) == doctest::Approx(0.5f));
    CHECK(smoothstep(2.f) == 1.f);
}

TEST_CASE("math: rect and colour helpers") {
    const Rect r{{0.f, 0.f}, {10.f, 5.f}};
    CHECK(contains(r, Vec2{10.f, 5.f}));
    CHECK_FALSE(contains(r, Vec2{10.1f, 1.f}));
    CHECK(intersects(r, Rect{{9.f, 4.f}, {20.f, 20.f}}));
    CHECK_FALSE(intersects(r, Rect{{11.f, 0.f}, {20.f, 5.f}}));
    const Rect e = expanded(r, 2.f);
    CHECK(e.min == Vec2{-2.f, -2.f});
    CHECK(e.max == Vec2{12.f, 7.f});
    constexpr Rgba8 c = rgb(0xE8DCC2);
    CHECK(c.r == 0xE8);
    CHECK(c.g == 0xDC);
    CHECK(c.b == 0xC2);
    CHECK(c.a == 255);
}
