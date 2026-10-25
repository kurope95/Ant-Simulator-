add_executable(antsim_tests
    test_main.cpp
    core/test_build_info.cpp
    core/test_math.cpp)
target_link_libraries(antsim_tests PRIVATE antsim_core doctest::doctest)
antsim_target_defaults(antsim_tests)
add_test(NAME antsim_tests COMMAND antsim_tests)
