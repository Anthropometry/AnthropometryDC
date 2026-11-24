/** F8 export: R2/S3 request signing, checked against AWS's published example (GET Object with a Range). */
import { describe, expect, it } from 'vitest'
import { amzDate, encodePath, signGet } from './sigv4'

describe('AWS Signature Version 4 (GET object)', () => {
  it('matches the AWS documentation example', async () => {
    const h = await signGet({
      method: 'GET',
      host: 'examplebucket.s3.amazonaws.com',
      path: '/test.txt',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      amzDate: '20130524T000000Z',
      headers: { range: 'bytes=0-9' },
    })
    expect(h.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    )
    expect(h).not.toHaveProperty('host')
  })

  it('dates and paths', () => {
    expect(amzDate(new Date('2026-11-13T09:05:07.123Z'))).toBe('20261113T090507Z')
    expect(encodePath('/anthro-collect-photos/practice/ab cd/front.jpg')).toBe('/anthro-collect-photos/practice/ab%20cd/front.jpg')
  })
})
