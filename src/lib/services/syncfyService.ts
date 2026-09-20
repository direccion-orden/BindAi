/**
 * Syncfy (Paybook Sync) API Client Service
 * Documentación oficial: https://opendata-api.syncfy.com/v1
 */

import fs from 'fs';
import path from 'path';

const SYNCFY_BASE_URL = process.env.SYNCFY_BASE_URL || 'https://opendata-api.syncfy.com/v1';

export interface SyncfyUser {
  id_user: string;
  id_external?: string;
  name?: string;
  dt_create?: string;
}

export interface SyncfyAccount {
  id_account: string;
  id_user: string;
  id_external?: string;
  id_credential?: string;
  name: string;
  number?: string;
  balance?: number;
  currency?: string;
  site?: {
    id_site?: string;
    name?: string;
    type?: string;
    organization?: string;
  };
}

export interface SyncfyTransaction {
  id_transaction: string;
  id_user: string;
  id_external?: string;
  id_account: string;
  description: string;
  amount: number;
  dt_transaction: string;
  reference?: string;
  currency?: string;
  attachments?: any[];
}

export class SyncfyService {
  public static getApiKey(): string {
    let key = process.env.SYNCFY_API_KEY;
    if (!key) {
      try {
        const envPath = path.resolve(process.cwd(), '.env.local');
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, 'utf8');
          for (const line of envContent.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.startsWith('SYNCFY_API_KEY=')) {
              key = trimmed.substring('SYNCFY_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
              if (key) {
                process.env.SYNCFY_API_KEY = key;
                break;
              }
            }
          }
        }
      } catch (e) {}
    }
    if (!key) {
      throw new Error('SYNCFY_API_KEY is not configured in environment variables');
    }
    return key;
  }

  /**
   * Helper unificado para llamadas al API de Syncfy
   */
  private static async request<T = any>(
    route: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    auth: { apiKey?: boolean; token?: string } = { apiKey: true },
    payload?: any
  ): Promise<T> {
    const url = `${SYNCFY_BASE_URL}${route}`;

    const headers: Record<string, string> = {
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json',
      'X-Client-Identifier': 'BindAi-ERP',
    };

    if (auth.token) {
      headers['Authorization'] = `TOKEN token=${auth.token}`;
    } else {
      const apiKey = this.getApiKey();
      headers['Authorization'] = `api_key api_key=${apiKey}`;
    }

    const options: RequestInit = {
      method: method === 'GET' && payload ? 'POST' : method,
      headers,
    };

    if (method === 'GET' && payload) {
      headers['X-Http-Method-Override'] = 'GET';
      options.body = JSON.stringify(payload);
    } else if (payload && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(payload);
    } else if (method === 'DELETE' && payload) {
      headers['X-Http-Method-Override'] = 'DELETE';
      options.body = JSON.stringify(payload);
    }

    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';

    let data: any = null;
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    if (!res.ok) {
      const errorMsg = data?.message || data?.response?.message || `Syncfy API Error (${res.status}): ${typeof data === 'string' ? data : JSON.stringify(data)}`;
      throw new Error(errorMsg);
    }

    // Paybook / Syncfy a veces encapsula las respuestas en { response: [...] }
    return (data && typeof data === 'object' && 'response' in data) ? data.response : data;
  }

  /**
   * Obtiene o crea un usuario en Syncfy mapeado al companyId del ERP
   */
  public static async getOrCreateUser(companyId: string, companyName?: string): Promise<SyncfyUser> {
    try {
      // 1. Intentar buscar por id_external
      const existingUsers = await this.request<SyncfyUser[]>('/users', 'GET', { apiKey: true }, {
        id_external: companyId,
      });

      if (Array.isArray(existingUsers) && existingUsers.length > 0) {
        return existingUsers[0];
      }
    } catch (err: any) {
      console.warn(`[SyncfyService] No se encontró usuario para id_external=${companyId}, procediendo a crear uno nuevo.`);
    }

    // 2. Crear nuevo usuario si no existe
    const newUser = await this.request<SyncfyUser>('/users', 'POST', { apiKey: true }, {
      id_external: companyId,
      name: (companyName || `Empresa ${companyId}`).substring(0, 50),
    });

    return newUser;
  }

  /**
   * Genera un Token de Sesión efímero para un usuario específico (para el Widget v3)
   */
  public static async createSessionToken(idUser: string): Promise<string> {
    const session = await this.request<{ token: string }>('/sessions', 'POST', { apiKey: true }, {
      id_user: idUser,
    });

    if (!session?.token) {
      throw new Error('Syncfy did not return a session token');
    }

    return session.token;
  }

  /**
   * Obtiene las cuentas bancarias descubiertas para una sesión o credencial
   */
  public static async getAccounts(token: string, idCredential?: string): Promise<SyncfyAccount[]> {
    const payload: any = {};
    if (idCredential) payload.id_credential = idCredential;

    const accounts = await this.request<SyncfyAccount[]>('/accounts', 'GET', { token }, payload);
    return Array.isArray(accounts) ? accounts : [];
  }

  /**
   * Obtiene los movimientos o transacciones bancarias
   */
  public static async getTransactions(
    token: string,
    options: {
      id_account?: string;
      id_credential?: string;
      dt_transaction_from?: string;
      dt_transaction_to?: string;
      limit?: number;
      skip?: number;
    } = {}
  ): Promise<SyncfyTransaction[]> {
    const payload: any = {
      limit: options.limit || 500,
      skip: options.skip || 0,
    };
    if (options.id_account) payload.id_account = options.id_account;
    if (options.id_credential) payload.id_credential = options.id_credential;
    if (options.dt_transaction_from) payload.dt_transaction_from = options.dt_transaction_from;
    if (options.dt_transaction_to) payload.dt_transaction_to = options.dt_transaction_to;

    const transactions = await this.request<SyncfyTransaction[]>('/transactions', 'GET', { token }, payload);
    return Array.isArray(transactions) ? transactions : [];
  }

  /**
   * Obtiene las credenciales vinculadas en Syncfy para un usuario
   */
  public static async getCredentials(token: string): Promise<any[]> {
    const credentials = await this.request<any[]>('/credentials', 'GET', { token });
    return Array.isArray(credentials) ? credentials : [];
  }

  /**
   * Elimina una credencial bancaria
   */
  public static async deleteCredential(token: string, idCredential: string): Promise<any> {
    return await this.request(`/credentials/${idCredential}`, 'DELETE', { token });
  }

  /**
   * Obtiene catálogo de sitios/bancos disponibles
   */
  public static async getSites(token: string, filter?: any): Promise<any[]> {
    return await this.request('/catalogues/organizations/sites', 'GET', { token }, filter || {});
  }
}
