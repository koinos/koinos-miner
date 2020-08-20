#include "bn.h"
#include "keccak256.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#include <io.h>
#else
#include <unistd.h>
#endif

#define WORD_BUFFER_BYTES  (2 << 20) // 2 MB
#define WORD_BUFFER_LENGTH (WORD_BUFFER_BYTES / sizeof(struct bn))

#define SAMPLE_INDICES 10
#define READ_BUFSIZE   1024
#define ETH_HASH_SIZE  66

struct bn primes[10];
struct bn buffer_size;

void init_work_constants()
{
   bignum_from_int( primes,     0x0000fffd );
   bignum_from_int( primes + 1, 0x0000fffb );
   bignum_from_int( primes + 2, 0x0000fff7 );
   bignum_from_int( primes + 3, 0x0000fff1 );
   bignum_from_int( primes + 4, 0x0000ffef );
   bignum_from_int( primes + 5, 0x0000ffe5 );
   bignum_from_int( primes + 6, 0x0000ffdf );
   bignum_from_int( primes + 7, 0x0000ffd9 );
   bignum_from_int( primes + 8, 0x0000ffd3 );
   bignum_from_int( primes + 9, 0x0000ffd1 );

   bignum_from_int( &buffer_size, WORD_BUFFER_LENGTH - 1 ); // 0x0000FFFF
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

struct input_data
{
   char     block_hash[ETH_HASH_SIZE + 1];
   uint64_t block_num;
};

void read_data( struct input_data* d )
{
   char buf[READ_BUFSIZE] = { '\0' };

   int i = 0;
   do
   {
      int c;
      while ((c = getchar()) != '\n' && c != EOF)
      {
         if ( i < READ_BUFSIZE )
         {
            buf[i++] = c;
         }
         else
         {
            fprintf(stderr, "[C] Buffer was about to overflow!");
         }
      }
   } while ( strlen(buf) == 0 || buf[strlen(buf)-1] != ';' );

   fprintf(stderr, "[C] Buffer: %s\n", buf);
   sscanf(buf, "%66s %llu", d->block_hash, &d->block_num);

   fprintf(stderr, "[C] Ethereum Block Hash: %s\n", d->block_hash );
   fprintf(stderr, "[C] Ethereum Block Number: %llu\n", d->block_num );
   fflush(stderr);
}

void write_data( struct bn* nonce )
{
   char bn_str[78];
   bignum_to_string( nonce, bn_str, sizeof(bn_str), false );

   fprintf(stderr, "[C] Nonce: %s\n", bn_str);
   fflush(stderr);

   fprintf(stdout, "%s;", bn_str );
   fflush(stdout);
}

void hash_secured_struct( struct bn* res, struct secured_struct* ss )
{
   SHA3_CTX c;
   keccak_init( &c );
   keccak_update( &c, (unsigned char*)ss, sizeof(struct secured_struct) );
   keccak_final( &c, (unsigned char*)res );
   bignum_endian_swap( res );
}


void find_and_xor_word( struct bn* result, struct bn* secured_struct_hash, struct bn* prime, struct bn* coefficients, struct bn* word_buffer )
{
   struct bn x, y, tmp;

   bignum_mod( secured_struct_hash, prime, &x );      // x = secured_struct_hash % prime
   bignum_mul( coefficients + 4, &x, &y );            // y = coefficients[4] * x
   bignum_add( &y, coefficients + 3, &tmp );          // y += coefficients[3] (using tmp storage)
   bignum_mul( &tmp, &x, &y );                        // y *= x
   bignum_add( &y, coefficients + 2, &tmp );          // y += coefficients[2] (using tmp storage)
   bignum_mul( &tmp, &x, &y );                        // y *= x
   bignum_add( &y, coefficients + 1, &tmp );          // y += coefficients[1] (using tmp storage)
   bignum_mul( &tmp, &x, &y );                        // y *= x
   bignum_add( &y, coefficients, &tmp );              // y += coefficients[0] (using tmp storage)
   bignum_mod( &tmp, &buffer_size, &y );              // y %= 0x0000ffff
   unsigned int index = bignum_to_int( &y );
   bignum_xor( result, word_buffer + index, result ); // result ^= w
}


void work( struct bn* result, struct bn* secured_struct_hash, struct bn* nonce, struct bn* word_buffer )
{
   struct bn x;
   struct bn y;
   struct bn tmp;

   bignum_assign( result, secured_struct_hash ); // result = secured_struct_hash;

   struct bn coefficients[5];

   int i;
   for( i = 0; i < sizeof(coefficients) / sizeof(struct bn); ++i )
   {
      // coefficients[i] = (nonce % primes[i])+1
      bignum_init( coefficients + i );
      bignum_mod( nonce, primes + i, coefficients + i );
      bignum_inc( coefficients + i );
   }

   for( i = 0; i < sizeof(primes) / sizeof(struct bn); ++i )
   {
      find_and_xor_word( result, secured_struct_hash, primes + i, coefficients, word_buffer );
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

   while ( true )
   {
      struct input_data input;

      read_data( &input );

      struct secured_struct ss;

      keccak_init( &c );
      keccak_update( &c, (unsigned char*)"miner", 5 );
      keccak_final( &c, (unsigned char*)&ss.miner );
      bignum_endian_swap( &ss.miner );
//      bignum_init( &ss.recent_eth_block_number );
      bignum_from_int( &ss.recent_eth_block_number, input.block_num );
//      bignum_init( &ss.recent_eth_block_hash );
      bignum_from_string( &ss.recent_eth_block_hash, input.block_hash + 2, ETH_HASH_SIZE - 1 );
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


      write_data( &nonce );
   }
}
