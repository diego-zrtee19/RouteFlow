/**
 * FedEx OAuth 2.0 Authentication Service
 * Handles OAuth token generation and management for FedEx API requests
 * 
 * Documentation: https://developer.fedex.com/api/en-us/catalog/authorization/docs.html
 */

interface FedExTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

class FedExAuthService {
  private token: string | null = null;
  private tokenExpiry: number = 0;
  private baseUrl: string;
  private clientId: string;
  private clientSecret: string;

  constructor() {
    this.baseUrl = process.env.FEDEX_BASE_URL || "https://apis-sandbox.fedex.com";
    this.clientId = process.env.FEDEX_CLIENT_ID || process.env.FEDEX_API_KEY || "";
    this.clientSecret = process.env.FEDEX_CLIENT_SECRET || process.env.FEDEX_SECRET_KEY || "";
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  /**
   * Get a valid OAuth access token
   * Returns cached token if still valid, otherwise requests a new one
   */
  async getAccessToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.token && this.tokenExpiry > Date.now()) {
      return this.token;
    }

    // Request a new token
    return this.requestNewToken();
  }

  /**
   * Request a new OAuth access token from FedEx
   */
  private async requestNewToken(): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error("FedEx credentials not configured. Please set FEDEX_CLIENT_ID and FEDEX_CLIENT_SECRET");
    }

    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('client_id', this.clientId);
      params.append('client_secret', this.clientSecret);

      const response = await fetch(`${this.baseUrl}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("FedEx OAuth error:", response.status, errorText);
        throw new Error(`FedEx OAuth failed: ${response.statusText}`);
      }

      const data: FedExTokenResponse = await response.json();

      if (!data.access_token) {
        throw new Error("FedEx OAuth response missing access_token");
      }

      // Cache the token
      this.token = data.access_token;
      // Set expiry to current time + expires_in (minus 5 minutes buffer)
      this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;

      console.log("FedEx OAuth token obtained successfully");
      return this.token;
    } catch (error) {
      console.error("FedEx OAuth token request failed:", error);
      throw new Error("Failed to obtain FedEx OAuth token");
    }
  }

  /**
   * Clear cached token (useful for testing or if token is invalidated)
   */
  clearToken(): void {
    this.token = null;
    this.tokenExpiry = 0;
  }

  /**
   * Check if the current token is about to expire (within 5 minutes)
   */
  isTokenExpiringSoon(): boolean {
    return this.tokenExpiry > 0 && this.tokenExpiry < Date.now() + 300000;
  }
}

// Singleton instance
export const fedexAuthService = new FedExAuthService();
