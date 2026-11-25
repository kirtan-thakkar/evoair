import crypto from 'crypto';
import { describe, it, expect } from 'vitest';
import {
  generatePayuPaymentHash,
  verifyPayuHash,
} from '../services/paymentService.js';

describe('PayU India Cryptographic Hash & Verification Engine', () => {
  const mockKey = 'TEST_MOCK_KEY';
  const mockSalt = 'TEST_MOCK_SALT_VALUE';

  const sampleParams = {
    key: mockKey,
    salt: mockSalt,
    txnid: 'EVO-ORDER-001',
    amount: '14999.00',
    productinfo: 'Evoluir Luxury Skincare & Cosmetics',
    firstname: 'Kirtan',
    email: 'kirtan@example.com',
    udf1: 'order-uuid-12345',
  };

  it('generates exact 16-pipe outbound SHA-512 payment hash', () => {
    const hash = generatePayuPaymentHash(sampleParams);

    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
    expect(hash.length).toBe(128); // 128-char hex string for sha512

    // Independently calculate expected hash string
    const expectedSequence = [
      sampleParams.key,
      sampleParams.txnid,
      sampleParams.amount,
      sampleParams.productinfo,
      sampleParams.firstname,
      sampleParams.email,
      sampleParams.udf1,
      '', // udf2
      '', // udf3
      '', // udf4
      '', // udf5
      '', // udf6
      '', // udf7
      '', // udf8
      '', // udf9
      '', // udf10
      sampleParams.salt,
    ].join('|');

    const expectedHash = crypto
      .createHash('sha512')
      .update(expectedSequence, 'utf8')
      .digest('hex')
      .toLowerCase();

    expect(hash).toBe(expectedHash);
  });

  it('verifies valid inbound reverse hash from PayU callback or webhook', () => {
    const status = 'success';
    const reverseSequence = [
      mockSalt,
      status,
      '', // udf10
      '', // udf9
      '', // udf8
      '', // udf7
      '', // udf6
      '', // udf5
      '', // udf4
      '', // udf3
      '', // udf2
      sampleParams.udf1,
      sampleParams.email,
      sampleParams.firstname,
      sampleParams.productinfo,
      sampleParams.amount,
      sampleParams.txnid,
      mockKey,
    ].join('|');

    const validIncomingHash = crypto
      .createHash('sha512')
      .update(reverseSequence, 'utf8')
      .digest('hex')
      .toLowerCase();

    const isVerified = verifyPayuHash(
      {
        status,
        udf1: sampleParams.udf1,
        email: sampleParams.email,
        firstname: sampleParams.firstname,
        productinfo: sampleParams.productinfo,
        amount: sampleParams.amount,
        txnid: sampleParams.txnid,
        key: mockKey,
        hash: validIncomingHash,
      },
      mockSalt
    );

    expect(isVerified).toBe(true);
  });

  it('verifies reverse hash when PayU includes additionalCharges', () => {
    const status = 'success';
    const additionalCharges = '25.00';
    const reverseSequence = `${additionalCharges}|${[
      mockSalt,
      status,
      '', // udf10
      '', // udf9
      '', // udf8
      '', // udf7
      '', // udf6
      '', // udf5
      '', // udf4
      '', // udf3
      '', // udf2
      sampleParams.udf1,
      sampleParams.email,
      sampleParams.firstname,
      sampleParams.productinfo,
      sampleParams.amount,
      sampleParams.txnid,
      mockKey,
    ].join('|')}`;

    const validIncomingHash = crypto
      .createHash('sha512')
      .update(reverseSequence, 'utf8')
      .digest('hex')
      .toLowerCase();

    const isVerified = verifyPayuHash(
      {
        additionalCharges,
        status,
        udf1: sampleParams.udf1,
        email: sampleParams.email,
        firstname: sampleParams.firstname,
        productinfo: sampleParams.productinfo,
        amount: sampleParams.amount,
        txnid: sampleParams.txnid,
        key: mockKey,
        hash: validIncomingHash,
      },
      mockSalt
    );

    expect(isVerified).toBe(true);
  });

  it('rejects tampered or forged payloads', () => {
    const status = 'success';
    const reverseSequence = [
      mockSalt,
      status,
      '', '', '', '', '', '', '', '', '',
      sampleParams.udf1,
      sampleParams.email,
      sampleParams.firstname,
      sampleParams.productinfo,
      sampleParams.amount,
      sampleParams.txnid,
      mockKey,
    ].join('|');

    const validIncomingHash = crypto
      .createHash('sha512')
      .update(reverseSequence, 'utf8')
      .digest('hex')
      .toLowerCase();

    // Tampered amount (attacker changed 14999.00 to 1.00)
    const tampered = verifyPayuHash(
      {
        status,
        udf1: sampleParams.udf1,
        email: sampleParams.email,
        firstname: sampleParams.firstname,
        productinfo: sampleParams.productinfo,
        amount: '1.00',
        txnid: sampleParams.txnid,
        key: mockKey,
        hash: validIncomingHash,
      },
      mockSalt
    );

    expect(tampered).toBe(false);
  });
});
