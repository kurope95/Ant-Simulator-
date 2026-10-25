#pragma once

#include <algorithm>
#include <cmath>

namespace antsim::core {

inline constexpr float kPi = 3.14159265358979323846f;
inline constexpr float kTwoPi = 2.f * kPi;

inline float wrap_angle(float a) {
    a = std::remainder(a, kTwoPi);
    if (a <= -kPi) a += kTwoPi;
    return a;
}

inline float angle_diff(float from, float to) { return wrap_angle(to - from); }

inline float lerp(float a, float b, float t) { return a + (b - a) * t; }

inline float smoothstep(float t) {
    t = std::clamp(t, 0.f, 1.f);
    return t * t * (3.f - 2.f * t);
}

}  // namespace antsim::core
