#include "bn.h"
#include "keccak256.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define WORD_BUFFER_BYTES  (2 << 20) // 2 MB
#define WORD_BUFFER_LENGTH (WORD_BUFFER_BYTES / sizeof(struct bn))

#define SAMPLE_INDICES 10

uint32_t primes[10];

uint32_t bignum_mod_small( struct bn* b, uint32_t m )
{
   // Compute b % m
   uint64_t tmp = 0;
   size_t i;
   for( int i=BN_ARRAY_SIZE-1; i>=0; i-- )
   {
      tmp = (tmp << 32) | b->array[i];
      tmp %= m;
   }
   return (uint32_t) tmp;
}

void init_work_constants()
{
   size_t i;

   primes[0] = 0x0000fffd;
   primes[1] = 0x0000fffb;
   primes[2] = 0x0000fff7;
   primes[3] = 0x0000fff1;
   primes[4] = 0x0000ffef;
   primes[5] = 0x0000ffe5;
   primes[6] = 0x0000ffdf;
   primes[7] = 0x0000ffd9;
   primes[8] = 0x0000ffd3;
   primes[9] = 0x0000ffd1;
}

struct work_data
{
   uint32_t x[10];
};

void init_work_data( struct work_data* wdata, struct bn* secured_struct_hash )
{
   size_t i;
   struct bn x;
   for( i=0; i<10; i++ )
   {
      wdata->x[i] = bignum_mod_small( secured_struct_hash, primes[i] );
   }
}

struct secured_struct
{
   struct bn miner;
   struct bn recent_eth_block_number;
   struct bn recent_eth_block_hash;
   struct bn target;
   struct bn pow_height;
   //struct bn tip_recipient;
   //struct bn tip_percent;
};

void hash_secured_struct( struct bn* res, struct secured_struct* ss )
{
   SHA3_CTX c;
   keccak_init( &c );
   keccak_update( &c, (unsigned char*)ss, sizeof(struct secured_struct) );
   keccak_final( &c, (unsigned char*)res );
   bignum_endian_swap( res );
}


void find_and_xor_word( struct bn* result, uint32_t x, uint32_t* coefficients, struct bn* word_buffer )
{
   uint64_t y = coefficients[4];
   y *= x;
   y += coefficients[3];
   y %= WORD_BUFFER_LENGTH - 1;
   y *= x;
   y += coefficients[2];
   y %= WORD_BUFFER_LENGTH - 1;
   y *= x;
   y += coefficients[1];
   y %= WORD_BUFFER_LENGTH - 1;
   y *= x;
   y += coefficients[0];
   y %= WORD_BUFFER_LENGTH - 1;
   bignum_xor( result, word_buffer + y, result );
}


void work( struct bn* result, struct bn* secured_struct_hash, struct bn* nonce, struct bn* word_buffer )
{
   struct work_data wdata;
   init_work_data( &wdata, secured_struct_hash );

   struct bn x;
   struct bn y;
   struct bn tmp;

   bignum_assign( result, secured_struct_hash ); // result = secured_struct_hash;

   uint32_t coefficients[5];

   int i;
   for( i = 0; i < sizeof(coefficients) / sizeof(uint32_t); ++i )
   {
      coefficients[i] = 1 + bignum_mod_small( nonce, primes[i] );
   }

   for( i = 0; i < sizeof(primes) / sizeof(uint32_t); ++i )
   {
      find_and_xor_word( result, wdata.x[i], coefficients, word_buffer );
   }
}



int main( int argc, char** argv )
{
   struct bn* word_buffer = malloc( WORD_BUFFER_BYTES );
   struct bn seed;

   char bn_str[78];

   SHA3_CTX c;

   keccak_init( &c );
   keccak_update( &c, (unsigned char*)"This is the seed.", 17 );
   keccak_final( &c, (unsigned char*)&seed );

   unsigned char index_padding[24];
   memset( index_padding, 0, sizeof(index_padding) );

   struct bn bn_i;

   // Procedurally generate word buffer w[i] from a seed
   // Each word buffer element is computed by w[i] = H(seed, i)
   for( unsigned long i = 0; i < WORD_BUFFER_LENGTH; i++ )
   {
      keccak_init( &c );
      keccak_update( &c, (unsigned char*)&seed, sizeof(seed) );
      bignum_from_int( &bn_i, i );
      bignum_endian_swap( &bn_i );
      keccak_update( &c, (unsigned char*)&bn_i, sizeof(struct bn) );
      keccak_final( &c, (unsigned char*)(word_buffer + i) );
      bignum_endian_swap( word_buffer + i );
   }

   init_work_constants();

   struct secured_struct ss;

   keccak_init( &c );
   keccak_update( &c, (unsigned char*)"miner", 5 );
   keccak_final( &c, (unsigned char*)&ss.miner );
   bignum_endian_swap( &ss.miner );
   bignum_init( &ss.recent_eth_block_number );
   bignum_init( &ss.recent_eth_block_hash );
   bignum_init( &ss.target );
   bignum_dec( &ss.target );
   bignum_rshift( &ss.target, &ss.target, 19 );
   bignum_init( &ss.pow_height );
   //keccak_init( &c );
   //keccak_update( &c, "oo", 5 );
   //keccak_final( &c, (unsigned char*)&ss.tip_recipient );
   //bignum_endian_swap( &ss.tip_recipient );
   //bignum_from_int( &ss.tip_percent, 5 );

   struct bn secured_struct_hash;
   hash_secured_struct( &secured_struct_hash, &ss );

   struct bn nonce;
   bignum_init( &nonce );

   struct bn result;

   do
   {
      bignum_inc( &nonce );
      work( &result, &secured_struct_hash, &nonce, word_buffer );
   } while( bignum_cmp( &result, &ss.target ) > 0 );


   bignum_to_string( &nonce, bn_str, sizeof(bn_str), false );
   printf( "Nonce: %s\n", bn_str );

   bignum_to_string( &result, bn_str, sizeof(bn_str), true );
   printf( "Proof: 0x%s\n", bn_str );
}
