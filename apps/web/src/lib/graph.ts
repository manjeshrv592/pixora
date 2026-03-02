/**
 * Microsoft Graph API client helper
 * Uses client credentials flow (app-only) to read all users/groups in a tenant
 */

// ─── Token Management ────────────────────────────────────────

interface TokenResponse {
    access_token: string;
    expires_in: number;
    token_type: string;
}

interface CachedToken {
    accessToken: string;
    expiresAt: number; // Unix timestamp in ms
}

// In-memory token cache — keyed by Azure tenant ID
// Tokens are valid for ~60 minutes; we cache for 55 minutes (5-min safety buffer)
const tokenCache = new Map<string, CachedToken>();
const TOKEN_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get an app-only access token for Microsoft Graph using client credentials.
 * Caches tokens per tenant to avoid redundant requests during sync operations.
 */
export async function getGraphAccessToken(azureTenantId: string): Promise<string> {
    // Check cache first
    const cached = tokenCache.get(azureTenantId);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.accessToken;
    }

    const clientId = process.env.AUTH_MICROSOFT_ENTRA_ID_ID;
    const clientSecret = process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error("Missing Azure AD client credentials in environment variables");
    }

    const tokenUrl = `https://login.microsoftonline.com/${azureTenantId}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
    });

    const response = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get Graph access token: ${response.status} ${errorText}`);
    }

    const data: TokenResponse = await response.json();

    // Cache the token with a safety buffer before actual expiry
    tokenCache.set(azureTenantId, {
        accessToken: data.access_token,
        expiresAt: Date.now() + (data.expires_in * 1000) - TOKEN_BUFFER_MS,
    });

    return data.access_token;
}

// ─── Graph API Types ─────────────────────────────────────────

export interface GraphUser {
    id: string;
    displayName: string | null;
    mail: string | null;
    userPrincipalName: string;
    jobTitle: string | null;
    department: string | null;
    country: string | null;
    city: string | null;
    businessPhones: string[];
}

export interface GraphGroup {
    id: string;
    displayName: string;
}

export interface GraphGroupMember {
    "@odata.type": string;
    id: string;
    displayName: string | null;
    mail: string | null;
    userPrincipalName?: string;
}

interface GraphPagedResponse<T> {
    value: T[];
    "@odata.nextLink"?: string;
}

// ─── Paginated Fetch Helper ──────────────────────────────────

async function fetchAllPages<T>(url: string, accessToken: string): Promise<T[]> {
    const allItems: T[] = [];
    let nextUrl: string | undefined = url;

    while (nextUrl) {
        const response = await fetch(nextUrl, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Graph API error: ${response.status} ${errorText}`);
        }

        const data: GraphPagedResponse<T> = await response.json();
        allItems.push(...data.value);
        nextUrl = data["@odata.nextLink"];
    }

    return allItems;
}

// ─── Graph API Functions ─────────────────────────────────────

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

const USER_SELECT_FIELDS = [
    "id",
    "displayName",
    "mail",
    "userPrincipalName",
    "jobTitle",
    "department",
    "country",
    "city",
    "businessPhones",
].join(",");

/**
 * Fetch all users from a tenant via MS Graph.
 * Filters out guest/external accounts — only returns members.
 */
export async function fetchGraphUsers(accessToken: string): Promise<GraphUser[]> {
    const url = `${GRAPH_BASE}/users?$select=${USER_SELECT_FIELDS}&$filter=userType eq 'Member'&$top=999`;
    return fetchAllPages<GraphUser>(url, accessToken);
}

/**
 * Fetch all groups from a tenant via MS Graph.
 * Only fetches security and M365 groups (not dynamic distribution lists).
 */
export async function fetchGraphGroups(accessToken: string): Promise<GraphGroup[]> {
    const url = `${GRAPH_BASE}/groups?$select=id,displayName&$filter=groupTypes/any(g:g eq 'Unified') or mailEnabled eq false&$top=999`;
    return fetchAllPages<GraphGroup>(url, accessToken);
}

/**
 * Fetch all members of a specific group.
 * Returns only user-type members (not nested groups or service principals).
 */
export async function fetchGraphGroupMembers(
    accessToken: string,
    groupId: string
): Promise<GraphGroupMember[]> {
    const url = `${GRAPH_BASE}/groups/${groupId}/members?$select=id,displayName,mail,userPrincipalName&$top=999`;
    const allMembers = await fetchAllPages<GraphGroupMember>(url, accessToken);
    // Filter to only user objects
    return allMembers.filter((m) => m["@odata.type"] === "#microsoft.graph.user");
}
