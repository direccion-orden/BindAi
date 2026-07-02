export interface ShopifyClientConfig {
  shopName: string;
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class ShopifyClient {
  private shopName: string;
  private accessToken?: string;
  private clientId?: string;
  private clientSecret?: string;
  private apiVersion = "2024-04";

  constructor(config: ShopifyClientConfig) {
    // Clean shopName (ensure it has .myshopify.com and no protocol prefix)
    let cleanShop = config.shopName.trim().toLowerCase();
    cleanShop = cleanShop.replace(/^(https?:\/\/)?(www\.)?/, "");
    if (!cleanShop.includes(".myshopify.com") && !cleanShop.includes("localhost")) {
      cleanShop = `${cleanShop}.myshopify.com`;
    }
    this.shopName = cleanShop;
    this.accessToken = config.accessToken?.trim();
    this.clientId = config.clientId?.trim();
    this.clientSecret = config.clientSecret?.trim();
  }

  private getBaseUrl(): string {
    return `https://${this.shopName}/admin/api/${this.apiVersion}`;
  }

  private async getOrFetchAccessToken(): Promise<string> {
    if (this.accessToken) {
      return this.accessToken;
    }

    // If we have client credentials but no access token, the user needs to
    // complete the OAuth authorization code flow first. The token exchange
    // happens in /api/shopify/callback, not here.
    throw new Error(
      "No hay un Access Token configurado. Por favor conecta tu tienda usando el botón 'Conectar con Shopify' para completar el flujo de autorización OAuth."
    );
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.getBaseUrl()}${endpoint}`;
    const token = await this.getOrFetchAccessToken();
    const headers = {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shopify API Error (${response.status}): ${errorText || response.statusText}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  // --- Locations ---
  async getLocations(): Promise<{ locations: any[] }> {
    return this.request<{ locations: any[] }>("/locations.json");
  }

  // --- Products ---
  async getProducts(limit = 50, sinceId?: string, status?: string): Promise<{ products: any[] }> {
    let endpoint = `/products.json?limit=${limit}`;
    if (sinceId) {
      endpoint += `&since_id=${sinceId}`;
    }
    if (status) {
      endpoint += `&status=${status}`;
    }
    return this.request<{ products: any[] }>(endpoint);
  }

  async getProduct(productId: string): Promise<{ product: any }> {
    return this.request<{ product: any }>(`/products/${productId}.json`);
  }

  // --- Inventory ---
  async updateInventoryLevel(params: {
    inventory_item_id: number;
    location_id: number;
    available: number;
  }): Promise<{ inventory_level: any }> {
    return this.request<{ inventory_level: any }>("/inventory_levels/set.json", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  // --- Webhooks ---
  async getWebhooks(): Promise<{ webhooks: any[] }> {
    return this.request<{ webhooks: any[] }>("/webhooks.json");
  }

  async createWebhook(topic: string, address: string): Promise<{ webhook: any }> {
    return this.request<{ webhook: any }>("/webhooks.json", {
      method: "POST",
      body: JSON.stringify({
        webhook: {
          topic,
          address,
          format: "json",
        },
      }),
    });
  }

  async deleteWebhook(webhookId: string | number): Promise<void> {
    await this.request<void>(`/webhooks/${webhookId}.json`, {
      method: "DELETE",
    });
  }

  // --- Product Create/Update ---
  async createProduct(productData: Record<string, any>): Promise<{ product: any }> {
    return this.request<{ product: any }>("/products.json", {
      method: "POST",
      body: JSON.stringify({ product: productData }),
    });
  }

  async updateProduct(shopifyProductId: string, productData: Record<string, any>): Promise<{ product: any }> {
    return this.request<{ product: any }>(`/products/${shopifyProductId}.json`, {
      method: "PUT",
      body: JSON.stringify({ product: productData }),
    });
  }

  // --- Orders ---
  async getOrders(params: {
    limit?: number;
    since_id?: string;
    status?: string;
    created_at_min?: string;
  }): Promise<{ orders: any[] }> {
    let endpoint = `/orders.json?limit=${params.limit || 50}`;
    if (params.since_id) endpoint += `&since_id=${params.since_id}`;
    if (params.status) endpoint += `&status=${params.status}`;
    if (params.created_at_min) endpoint += `&created_at_min=${params.created_at_min}`;
    
    return this.request<{ orders: any[] }>(endpoint);
  }
}
