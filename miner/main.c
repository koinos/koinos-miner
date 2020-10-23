
#include "bn.h"
#include "keccak256.h"

#include <inttypes.h>
#include <omp.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#ifdef _WIN32
#include <io.h>
#include <fcntl.h>
#else
#include <unistd.h>
#endif

#define WORD_BUFFER_BYTES  (2 << 20) // 2 MB
#define WORD_BUFFER_LENGTH (WORD_BUFFER_BYTES / sizeof(struct bn))

#define SAMPLE_INDICES         10
#define READ_BUFSIZE         1024
#define ETH_HASH_SIZE          66
#define ETH_ADDRESS_SIZE       42
#define PERCENT_100         10000

#define THREAD_ITERATIONS 600000

#define HASH_REPORT_THRESHOLD 1

int to_hex_string( unsigned char* n, unsigned char* dest, int len )
{
   static const char hex[16] = {'0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f'};

   for( int i = 0; i < len; i++ )
   {
      dest[2 * i]     = hex[(n[i] & 0xF0) >> 4];
      dest[2 * i + 1] = hex[n[i] & 0x0F];
   }

   return len * 2;
}

bool is_hex_prefixed( char* str )
{
   return str[0] == '0' && str[1] == 'x';
}

uint32_t coprimes[10];

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

void bignum_add_small( struct bn* b, uint32_t n )
{

   uint32_t tmp = b->array[0];
   b->array[0] += n;
   int i = 0;
   while( i < BN_ARRAY_SIZE - 1 && tmp > b->array[i] )
   {
      tmp = b->array[i+1];
      b->array[i+1]++;
      i++;
   }
}

void init_work_constants()
{
   size_t i;

   coprimes[0] = 0x0000fffd;
   coprimes[1] = 0x0000fffb;
   coprimes[2] = 0x0000fff7;
   coprimes[3] = 0x0000fff1;
   coprimes[4] = 0x0000ffef;
   coprimes[5] = 0x0000ffe5;
   coprimes[6] = 0x0000ffdf;
   coprimes[7] = 0x0000ffd9;
   coprimes[8] = 0x0000ffd3;
   coprimes[9] = 0x0000ffd1;
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
      wdata->x[i] = bignum_mod_small( secured_struct_hash, coprimes[i] );
   }
}

/*
 * Solidity definition:
 *
 * address[] memory recipients,
 * uint256[] memory split_percents,
 * uint256 recent_eth_block_number,
 * uint256 recent_eth_block_hash,
 * uint256 target,
 * uint256 pow_height
 */
struct secured_struct
{
   struct bn miner_address;
   struct bn oo_address;
   struct bn miner_percent;
   struct bn oo_percent;
   struct bn recent_eth_block_number;
   struct bn recent_eth_block_hash;
   struct bn target;
   struct bn pow_height;
};

struct input_data
{
   char     miner_address[ETH_ADDRESS_SIZE + 1];
   char     tip_address[ETH_ADDRESS_SIZE + 1];
   char     block_hash[ETH_HASH_SIZE + 1];
   uint64_t block_num;
   char     difficulty_str[ETH_HASH_SIZE + 1];
   uint64_t tip;
   uint64_t pow_height;
   uint64_t thread_iterations;
   uint64_t hash_limit;
   char     nonce_offset[ETH_HASH_SIZE + 1];
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
   sscanf(buf, "%42s %42s %66s %" SCNu64 " %66s %" SCNu64 " %" SCNu64 " %" SCNu64 " %" SCNu64 " %66s",
      d->miner_address,
      d->tip_address,
      d->block_hash,
      &d->block_num,
      d->difficulty_str,
      &d->tip,
      &d->pow_height,
      &d->thread_iterations,
      &d->hash_limit,
      d->nonce_offset);

   fprintf(stderr, "[C] Miner address: %s\n", d->miner_address);
   fprintf(stderr, "[C] Tip address:   %s\n", d->tip_address);
   fprintf(stderr, "[C] Ethereum Block Hash: %s\n", d->block_hash );
   fprintf(stderr, "[C] Ethereum Block Number: %" PRIu64 "\n", d->block_num );
   fprintf(stderr, "[C] Difficulty Target: %s\n", d->difficulty_str );
   fprintf(stderr, "[C] OpenOrchard Tip: %" PRIu64 "\n", d->tip );
   fprintf(stderr, "[C] PoW Height: %" PRIu64 "\n", d->pow_height );
   fprintf(stderr, "[C] Thread Iterations: %" PRIu64 "\n", d->thread_iterations );
   fprintf(stderr, "[C] Hash Limit: %" PRIu64 "\n", d->hash_limit );
   fprintf(stderr, "[C] Nonce Offset: %s\n", d->nonce_offset );
   fflush(stderr);
}


void hash_secured_struct( struct bn* res, struct secured_struct* ss )
{
   /* Solidity ABI encodes as follows:
    *
    * Offset pointer to recipient array (256 bits big endian)
    * Offset pointer to split_perecents array (256 bits big endian)
    * recent_eth_block_number (256 bit big endian)
    * recent_eth_block_hash (256 bit big endian)
    * target (256 bit big endian)
    * pow_height (256 bit big endian)
    * size of recipient array (256 bit big endian)
    * miner_address
    * oo_address
    * size of split_percent_array (256 bit big endian)
    * miner_percent
    * recipient_offset
    */

   char bn_str[78];
   memset(bn_str, 0, sizeof(78));

   struct bn recipient_offset, split_percent_offset, array_size;
   bignum_from_int( &recipient_offset, 6 * 32 );
   bignum_endian_swap( &recipient_offset );
   bignum_from_int( &split_percent_offset, 9 * 32 );
   bignum_endian_swap( &split_percent_offset );
   bignum_from_int( &array_size, 2 );
   bignum_endian_swap( &array_size );

   bignum_endian_swap( &ss->target );

   SHA3_CTX c;
   keccak_init( &c );
   keccak_update( &c, (unsigned char*)&recipient_offset, sizeof(struct bn) );
   keccak_update( &c, (unsigned char*)&split_percent_offset, sizeof(struct bn) );
   keccak_update( &c, (unsigned char*)&ss->recent_eth_block_number, sizeof(struct bn) );
   keccak_update( &c, (unsigned char*)&ss->recent_eth_block_hash, sizeof(struct bn) );
   keccak_update( &c, (unsigned char*)&ss->target, sizeof(struct bn) );
   keccak_update( &c, (unsigned char*)&ss->pow_height, sizeof(struct bn) );
   keccak_update( &c, (unsigned char*)&array_size, sizeof(struct bn) );
   keccak_update( &c, (unsigned char*)&ss->miner_address, sizeof(struct bn) );
   keccak_update( &c, (unsigned char*)&ss->oo_address, sizeof(struct bn) );
   keccak_update( &c, (unsigned char*)&array_size, sizeof(struct bn) );
   keccak_update( &c, (unsigned char*)&ss->miner_percent, sizeof(struct bn) );
   keccak_update( &c, (unsigned char*)&ss->oo_percent, sizeof(struct bn) );
   keccak_final( &c, (unsigned char*)res );

   bignum_endian_swap( res );
   bignum_endian_swap( &ss->target );
}


void find_word( struct bn* result, uint32_t x, uint32_t* coefficients, struct bn* word_buffer )
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
   bignum_assign( result, word_buffer + y );
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

   bignum_assign( result, secured_struct_hash ); // result = secured_struct_hash;

   uint32_t coefficients[5];

   int i;
   for( i = 0; i < sizeof(coefficients) / sizeof(uint32_t); ++i )
   {
      coefficients[i] = 1 + bignum_mod_small( nonce, coprimes[i] );
   }

   for( i = 0; i < sizeof(coprimes) / sizeof(uint32_t); ++i )
   {
      find_and_xor_word( result, wdata.x[i], coefficients, word_buffer );
   }
}


int words_are_unique( struct bn* secured_struct_hash, struct bn* nonce, struct bn* word_buffer )
{
   struct work_data wdata;
   struct bn w[sizeof(coprimes) / sizeof(uint32_t)];
   init_work_data( &wdata, secured_struct_hash );

   uint32_t coefficients[5];

   int i, j;
   for( i = 0; i < sizeof(coefficients) / sizeof(uint32_t); ++i )
   {
      coefficients[i] = 1 + bignum_mod_small( nonce, coprimes[i] );
   }

   for( i = 0; i < sizeof(coprimes) / sizeof(uint32_t); ++i )
   {
      find_word( w+i, wdata.x[i], coefficients, word_buffer );
      for( j = 0; j < i; j++ )
      {
         if( bignum_cmp( w+i, w+j ) == 0 )
            return 0;
      }
   }
   return 1;
}


int main( int argc, char** argv )
{
   #ifdef _WIN32
      _setmode( _fileno( stdin ), _O_BINARY );
   #endif

   struct bn* word_buffer = malloc( WORD_BUFFER_BYTES );
   struct bn seed, bn_i;

   char bn_str[78];
   char bn_str2[78];

   SHA3_CTX c;

   struct secured_struct ss;

   init_work_constants();

   bignum_init( &seed );

   while ( true )
   {
      struct input_data input;

      read_data( &input );

      if( is_hex_prefixed( input.miner_address ) )
      {
         bignum_from_string( &ss.miner_address, input.miner_address + 2, strlen(input.miner_address) - 2 );
      }
      else
      {
         bignum_from_string( &ss.miner_address, input.miner_address , strlen(input.miner_address) );
      }

      if( is_hex_prefixed( input.tip_address ) )
      {
         bignum_from_string( &ss.oo_address, input.tip_address + 2, strlen(input.tip_address) - 2 );
      }
      else
      {
         bignum_from_string( &ss.oo_address, input.tip_address, strlen(input.tip_address) );
      }

      bignum_to_string( &ss.miner_address, bn_str, sizeof(bn_str), false );
      fprintf(stderr, "[C] Miner Address: %s\n", bn_str);

      bignum_to_string( &ss.oo_address, bn_str, sizeof(bn_str), false );
      fprintf(stderr, "[C] OpenOrchard Address: %s\n", bn_str);
      fflush(stderr);

      bignum_endian_swap( &ss.miner_address );
      bignum_endian_swap( &ss.oo_address );

      uint64_t miner_pay = PERCENT_100 - input.tip;
      uint64_t oo_pay    = input.tip;

      fprintf(stderr, "[C] Miner pay: %" PRIu64 "\n", miner_pay);
      fprintf(stderr, "[C] OpenOrchard tip: %" PRIu64 "\n", oo_pay);

      bignum_from_int( &ss.miner_percent, PERCENT_100 - input.tip );
      bignum_endian_swap( &ss.miner_percent );
      bignum_from_int( &ss.oo_percent, input.tip );
      bignum_endian_swap( &ss.oo_percent );
      bignum_from_int( &ss.recent_eth_block_number, input.block_num );
      bignum_endian_swap( &ss.recent_eth_block_number );

      if( is_hex_prefixed( input.block_hash ) )
      {
         bignum_from_string( &ss.recent_eth_block_hash, input.block_hash + 2, ETH_HASH_SIZE - 2 );
      }
      else
      {
         bignum_from_string( &ss.recent_eth_block_hash, input.block_hash, ETH_HASH_SIZE - 2 );
      }

      bignum_endian_swap( &ss.recent_eth_block_hash );

      if( is_hex_prefixed( input.difficulty_str ) )
      {
         bignum_from_string( &ss.target, input.difficulty_str + 2, ETH_HASH_SIZE - 2 );
      }
      else
      {
         bignum_from_string( &ss.target, input.difficulty_str, ETH_HASH_SIZE - 2 );
      }

      bignum_from_int( &ss.pow_height, input.pow_height );
      bignum_endian_swap( &ss.pow_height );

      if( bignum_cmp( &seed, &ss.recent_eth_block_hash ) )
      {
         bignum_assign( &seed, &ss.recent_eth_block_hash );
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
      }

      bignum_to_string( &seed, bn_str, sizeof(bn_str), true );
      fprintf(stderr, "[C] Seed: %s\n", bn_str);

      bignum_to_string( &ss.target, bn_str, sizeof(bn_str), true );
      fprintf(stderr, "[C] Difficulty Target: %s\n", bn_str);
      fflush(stderr);

      struct bn secured_struct_hash;
      hash_secured_struct( &secured_struct_hash, &ss );

      bignum_to_string( &secured_struct_hash, bn_str, sizeof(bn_str), true);
      fprintf(stderr, "[C] Secured Struct Hash: %s\n", bn_str );

      struct bn nonce;
      bignum_assign( &nonce, &ss.recent_eth_block_hash );
      bignum_endian_swap( &nonce );

      struct bn nonce_offset;
      if( is_hex_prefixed( input.nonce_offset ) )
      {
         bignum_from_string( &nonce_offset, input.nonce_offset + 2, ETH_HASH_SIZE - 2 );
      }
      else
      {
         bignum_from_string( &nonce_offset, input.nonce_offset, ETH_HASH_SIZE - 2 );
      }
      bignum_add( &nonce, &nonce_offset, &nonce );

      bignum_to_string( &nonce, bn_str, sizeof(bn_str), true );
      fprintf(stderr, "[C] Starting Nonce: %s\n", bn_str );

      struct bn result, t_nonce, t_result, s_nonce;
      bool stop = false;

      bignum_assign( &s_nonce, &nonce );
      uint32_t hash_report_counter = 0;
      time_t timer;
      struct tm* timeinfo;
      char time_str[20];

      uint64_t hashes = 0;

      bignum_init( &result );

      #pragma omp parallel private(t_nonce, t_result)
      {
         while( !stop && hashes <= input.hash_limit )
         {
            #pragma omp critical
            {
               if( omp_get_thread_num() == 0 )
               {
                  if( hash_report_counter >= HASH_REPORT_THRESHOLD )
                  {
                     time( &timer );
                     timeinfo = localtime( &timer );
                     strftime( time_str, sizeof(time_str), "%FT%T", timeinfo );
                     fprintf( stdout, "H:%s %" PRId64 ";\n", time_str, hashes );
                     fflush( stdout );
                     hash_report_counter = 0;
                  }
                  else
                  {
                     hash_report_counter++;
                  }

               }
               bignum_assign( &t_nonce, &s_nonce );
               bignum_add_small( &s_nonce, input.thread_iterations );
               hashes += input.thread_iterations;
            }

            for( uint64_t i = 0; i < input.thread_iterations && !stop; i++ )
            {
               work( &t_result, &secured_struct_hash, &t_nonce, word_buffer );

               if( bignum_cmp( &t_result, &ss.target ) <= 0)
               {
                  if( !words_are_unique( &secured_struct_hash, &t_nonce, word_buffer ) )
                  {
                     // Non-unique, do nothing
                     // This is normal
                     fprintf( stderr, "[C] Possible proof failed uniqueness check\n");
                     bignum_inc( &t_nonce );
                  }
                  else
                  {
                     #pragma omp crticial
                     {
                        // Two threads could find a valid proof at the same time (unlikely, but possible).
                        // We want to return the more difficult proof
                        if( !stop )
                        {
                           stop = true;
                           bignum_assign( &result, &t_result );
                           bignum_assign( &nonce, &t_nonce );
                        }
                        else if( bignum_cmp( &t_result, &result ) < 0 )
                        {
                           bignum_assign( &result, &t_result );
                           bignum_assign( &nonce, &t_nonce );
                        }
                     }
                  }
               }
               else
                  bignum_inc( &t_nonce );
            }
         }
      }

      if( bignum_is_zero( &result ) )
      {
         fprintf( stdout, "F:1;\n" );

         fprintf(stderr, "[C] Finished without nonce\n");
         fflush(stderr);
      }
      else
      {
         bignum_to_string( &nonce, bn_str, sizeof(bn_str), false );
         bignum_to_string( &result, bn_str2, sizeof(bn_str2), false );
         fprintf( stdout, "N:%s;%s;\n", bn_str , bn_str2);

         fprintf(stderr, "[C] Nonce: %s\n", bn_str);
         fflush(stderr);
      }

      fflush( stdout );
   }
}
