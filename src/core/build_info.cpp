#include "core/build_info.hpp"

#include <string>

namespace antsim::core {

std::string_view build_info() {
    static const std::string text = [] {
        std::string s = "AntSim ";
        s += ANTSIM_VERSION;
        s += " (MSVC ";
        s += std::to_string(_MSC_VER);
#ifdef _M_ARM64
        s += ", ARM64";
#else
        s += ", not-ARM64";
#endif
#if _MSVC_LANG >= 202002L
        s += ", C++20";
#else
        s += ", pre-C++20";
#endif
        s += ")";
        return s;
    }();
    return text;
}

}  // namespace antsim::core
