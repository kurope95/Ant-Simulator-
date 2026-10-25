#pragma once

#include <cstdint>

namespace antsim::core {

struct Rgba8 {
    std::uint8_t r = 0, g = 0, b = 0, a = 255;
};

constexpr Rgba8 rgb(std::uint32_t hex) {
    return Rgba8{static_cast<std::uint8_t>((hex >> 16) & 0xFFu),
                 static_cast<std::uint8_t>((hex >> 8) & 0xFFu),
                 static_cast<std::uint8_t>(hex & 0xFFu),
                 255};
}

}  // namespace antsim::core
