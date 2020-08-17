#include <openssl/evp.h>

//#include <cstdint>
//#include <memory>
//#include <iostream>
//#include <sstream>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define WORD_BUFFER_BYTES 1 << 10 // 2 MB
#define WORD_SIZE         1 << 5  // each word is 32 bytes (256 bit)
#define WORD_BUFFER_SIZE  WORD_BUFFER_BYTES / WORD_SIZE

#define SAMPLE_INDICES 10

const unsigned long index_padding[3] = { 0x0000000000000000, 0x0000000000000000, 0x0000000000000000 };

int to_hex_string( unsigned char* dest, unsigned char* n, int len )
{
   static const char hex[16] = {'0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f'};

   for( int i = 0; i < len; i++ )
   {
      dest[2 * i]     = hex[(n[i] & 0xF0) >> 4];
      dest[2 * i + 1] = hex[n[i] & 0x0F];
   }

   return len * 2;
}

/**
 * Args:
 * seed block
 * recipient
 * work counter
 * tip address
 * tip percent
 */
int main( int argc, char** argv )
{
   // 256 bit seed
   // SHA_256( "hello world" )
   unsigned long seed[4] = { 0xB94D27B9934D3E08, 0xA52E52D7DA7DABFA, 0xC484EFE37A5380EE, 0x9088F7ACE2EFCDE9 };

   unsigned long* word_buffer = malloc( (WORD_BUFFER_BYTES) * sizeof(unsigned long));

   EVP_MD_CTX *mdctx = EVP_MD_CTX_new();
   const EVP_MD *md = EVP_sha256();
   unsigned int md_len;

   // Procedurally generate word buffer w[i] from a seed
   // Each word buffer element is computed by w[i] = H(seed, i)
   for( unsigned long i = 0; i < WORD_BUFFER_SIZE; i++ )
   {
      EVP_DigestInit_ex( mdctx, md, NULL );
      EVP_DigestUpdate( mdctx, seed, sizeof( seed ) );
      EVP_DigestUpdate( mdctx, index_padding, sizeof( index_padding ) );
      EVP_DigestUpdate( mdctx, &i, sizeof( i ) );
      EVP_DigestFinal_ex( mdctx, (unsigned char*)(word_buffer + i), &md_len );
      // assert md_len == 32
   }

   unsigned long miner_counter = 0;
   unsigned long tip_percent = 5;
   unsigned long difficulty_bits = 20;
   unsigned long padding = 0;

   unsigned long nonce[4];
   memset( nonce, 0, sizeof(nonce) );

   // Recipient address
   unsigned long recepient[4] = { 0xCE1695DA058EFB9E, 0x08064D5291E3FE1B, 0xA1657652045C2311, 0x1FB1A55472096246 };

   unsigned long tip_dest[4] =  { 0x15911486D0C4C2C3, 0x52517317F05646F6, 0xB48D21F3DAE8F05B, 0xCEF11652728FF680 }; // Tip address

   unsigned long h[4];
   memset( h, 0, sizeof(h) );

   unsigned long result[4];
   memset( result, 0, sizeof(result) );

   unsigned long index_buffer[4];
   memset( index_buffer, 0, sizeof(index_buffer) );

   do
   {
      nonce[3]++;

      for( unsigned long i = 0; i < SAMPLE_INDICES; i++ )
      {
         EVP_DigestInit_ex( mdctx, md, NULL );
         EVP_DigestUpdate( mdctx, &miner_counter, sizeof( miner_counter ) );
         EVP_DigestUpdate( mdctx, &tip_percent, sizeof( tip_percent ) );
         EVP_DigestUpdate( mdctx, &difficulty_bits, sizeof( difficulty_bits ) );
         EVP_DigestUpdate( mdctx, &i, sizeof( i ) );
         EVP_DigestUpdate( mdctx, nonce, sizeof( nonce ) );
         EVP_DigestUpdate( mdctx, recepient, sizeof( recepient ) );
         EVP_DigestUpdate( mdctx, tip_dest, sizeof( tip_dest ) );
         EVP_DigestUpdate( mdctx, &i, sizeof(i) );
         EVP_DigestFinal_ex( mdctx, (unsigned char*)h, &md_len );

         EVP_DigestInit_ex( mdctx, md, NULL );
         EVP_DigestUpdate( mdctx, h, sizeof(h) );
         EVP_DigestFinal_ex( mdctx, (unsigned char*)index_buffer, &md_len );

         unsigned long index = index_buffer[0] % WORD_BUFFER_SIZE;

         for( unsigned long j = 0; j < 4; j++ )
         {
            result[j] = result[j] ^ word_buffer[index + j] ^ h[j];
         }
      }
   } while( result[0] > 0x0000FFFFFFFFFFFF );

   printf( "%lu\n", nonce[3] );

   unsigned char hex_str[66];
   to_hex_string( hex_str, (unsigned char*)result, sizeof(result) );
   hex_str[64] = '\n';
   hex_str[65] = 0;
   printf( "%s", hex_str );
}
