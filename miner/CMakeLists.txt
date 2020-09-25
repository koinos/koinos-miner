set(OPENSSL_USE_STATIC_LIBS TRUE)
find_package( OpenSSL REQUIRED )

add_executable( koinos_miner
   main.c
   bn.c
   bn.h
   keccak256.c
   keccak256.h )

target_link_libraries( koinos_miner ${OPENSSL_LIBRARIES} )
target_include_directories( koinos_miner PUBLIC ${OPENSSL_INCLUDE_DIR} )
install( TARGETS
   koinos_miner
   RUNTIME DESTINATION bin
   LIBRARY DESTINATION lib
   ARCHIVE DESTINATION lib
)
