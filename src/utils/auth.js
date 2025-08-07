export class AuthService {
  constructor(env) {
    this.env = env;
    this.jwtSecret = env.JWT_SECRET;
  }

  // Generate JWT token (async)
  async generateToken(payload) {
    const header = {
      alg: 'HS256',
      typ: 'JWT'
    };
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      ...payload,
      iat: now,
      exp: now + (24 * 60 * 60), // 24 hours
      iss: 'techclinc-api'
    };
    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedClaims = this.base64UrlEncode(JSON.stringify(claims));
    const signature = await this.createSignature(`${encodedHeader}.${encodedClaims}`);
    const encodedSignature = this.base64UrlEncode(signature);
    return `${encodedHeader}.${encodedClaims}.${encodedSignature}`;
  }

  // Verify JWT token (async)
  async verifyToken(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token format');
      }
      const [encodedHeader, encodedClaims, encodedSignature] = parts;
      // Verify signature
      const signature = await this.createSignature(`${encodedHeader}.${encodedClaims}`);
      const expectedSignature = this.base64UrlEncode(signature);
      if (encodedSignature !== expectedSignature) {
        throw new Error('Invalid signature');
      }
      // Decode claims
      const claims = JSON.parse(this.base64UrlDecode(encodedClaims));
      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (claims.exp < now) {
        throw new Error('Token expired');
      }
      return claims;
    } catch (error) {
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }

  // Hash password (async)
  async hashPassword(password) {
    const salt = this.getRandomHex(16);
    const hash = await this.hmacSha256Hex(password + salt, this.jwtSecret);
    return `${salt}:${hash}`;
  }

  // Verify password (async)
  async verifyPassword(password, hashedPassword) {
    const [salt, hash] = hashedPassword.split(':');
    const computedHash = await this.hmacSha256Hex(password + salt, this.jwtSecret);
    return hash === computedHash;
  }

  // Generate random token for password reset
  generateResetToken() {
    return this.getRandomHex(32);
  }

  // Base64 URL encoding
  base64UrlEncode(strOrBuf) {
    let str;
    if (typeof strOrBuf === 'string') {
      str = btoa(unescape(encodeURIComponent(strOrBuf)));
    } else {
      // ArrayBuffer or Uint8Array
      str = btoa(String.fromCharCode(...new Uint8Array(strOrBuf)));
    }
    return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // Base64 URL decoding
  base64UrlDecode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) {
      str += '=';
    }
    return decodeURIComponent(escape(atob(str)));
  }

  // Create HMAC-SHA256 signature (returns Uint8Array)
  async createSignature(data) {
    const key = await this.importKey(this.jwtSecret);
    const enc = new TextEncoder();
    const sig = await crypto.subtle.sign(
      { name: 'HMAC' },
      key,
      enc.encode(data)
    );
    return new Uint8Array(sig);
  }

  // HMAC-SHA256 and return hex string
  async hmacSha256Hex(data, secret) {
    const key = await this.importKey(secret);
    const enc = new TextEncoder();
    const sig = await crypto.subtle.sign(
      { name: 'HMAC' },
      key,
      enc.encode(data)
    );
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Import key for HMAC
  async importKey(secret) {
    const enc = new TextEncoder();
    return await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );
  }

  // Get random hex string
  getRandomHex(length) {
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }
} 