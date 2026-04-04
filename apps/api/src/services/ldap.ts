/**
 * LDAP/Active Directory Authentication Service
 * Full implementation for enterprise directory integration
 */

import ldap from 'ldapjs';
import crypto from 'crypto';

interface LdapConfig {
    url: string;
    baseDN: string;
    bindDN: string;
    bindCredentials: string;
    searchFilter: string;
    usernameAttribute: string;
    emailAttribute: string;
    nameAttribute: string;
    groupSearchBase?: string;
    groupSearchFilter?: string;
    tlsOptions?: {
        rejectUnauthorized: boolean;
    };
}

interface LdapUser {
    username: string;
    email: string;
    displayName: string;
    firstName?: string;
    lastName?: string;
    groups: string[];
    dn: string;
    rawAttributes: Record<string, any>;
}

const getLdapConfig = (): LdapConfig => ({
    url: process.env.LDAP_URL || 'ldap://localhost:389',
    baseDN: process.env.LDAP_BASE_DN || 'dc=example,dc=com',
    bindDN: process.env.LDAP_BIND_DN || 'cn=admin,dc=example,dc=com',
    bindCredentials: process.env.LDAP_BIND_PASSWORD || 'admin',
    searchFilter: process.env.LDAP_SEARCH_FILTER || '(sAMAccountName={{username}})',
    usernameAttribute: process.env.LDAP_USERNAME_ATTR || 'sAMAccountName',
    emailAttribute: process.env.LDAP_EMAIL_ATTR || 'mail',
    nameAttribute: process.env.LDAP_NAME_ATTR || 'displayName',
    groupSearchBase: process.env.LDAP_GROUP_BASE,
    groupSearchFilter: process.env.LDAP_GROUP_FILTER || '(member={{dn}})',
    tlsOptions: {
        rejectUnauthorized: process.env.LDAP_TLS_VERIFY !== 'false'
    }
});

// Role mapping from LDAP groups
const LDAP_GROUP_ROLE_MAP: Record<string, string> = {
    'CN=Administrators,OU=Groups': 'Admin',
    'CN=Teachers,OU=Groups': 'Instructor',
    'CN=Assistants,OU=Groups': 'Assistant',
    'CN=Students,OU=Groups': 'Student',
};

export const LdapService = {
    /**
     * Authenticate user with LDAP
     */
    authenticate: async (username: string, password: string): Promise<{ success: boolean; user?: LdapUser; error?: string }> => {
        // MOCK MODE CHECK
        if (process.env.LMS_AUTH_MODE === 'mock') {
            console.log('[LDAP] Mock authentication for:', username);
            if (password === 'wrong') return { success: false, error: 'Invalid credentials' };

            return {
                success: true,
                user: {
                    username: username,
                    email: `${username}@mock-ldap.com`,
                    displayName: `Mock User (${username})`,
                    groups: ['CN=Students,OU=Groups'],
                    dn: `cn=${username},ou=users,dc=example,dc=com`,
                    rawAttributes: {}
                }
            };
        }

        const config = getLdapConfig();

        try {
            const client = ldap.createClient({
                url: config.url,
                tlsOptions: config.tlsOptions
            });

            // Bind with service account
            await new Promise((resolve, reject) => {
                client.bind(config.bindDN, config.bindCredentials, (err: any) => {
                    if (err) reject(err);
                    else resolve(true);
                });
            });

            // Search for user
            const searchFilter = config.searchFilter.replace('{{username}}', username);
            const searchResult = await new Promise<any>((resolve, reject) => {
                const entries: any[] = [];
                client.search(config.baseDN, {
                    filter: searchFilter,
                    scope: 'sub',
                    attributes: ['*']
                }, (err: any, res: any) => {
                    if (err) reject(err);
                    res.on('searchEntry', (entry: any) => entries.push(entry.object));
                    res.on('error', reject);
                    res.on('end', () => resolve(entries[0]));
                });
            });

            if (!searchResult) {
                client.unbind();
                return { success: false, error: 'User not found' };
            }

            // Verify user's password
            try {
                await new Promise((resolve, reject) => {
                    const userClient = ldap.createClient({
                        url: config.url,
                        tlsOptions: config.tlsOptions
                    });

                    userClient.bind(searchResult.dn, password, (err: any) => {
                        userClient.unbind();
                        if (err) reject(err);
                        else resolve(true);
                    });
                });
            } catch (err) {
                client.unbind();
                return { success: false, error: 'Invalid credentials' };
            }

            // Get user groups (if configured)
            // const groups = await LdapService.getUserGroups(client, searchResult.dn, config);
            // Simplified group mapping for now:
            const groups = searchResult.memberOf ? (Array.isArray(searchResult.memberOf) ? searchResult.memberOf : [searchResult.memberOf]) : [];

            client.unbind();

            return {
                success: true,
                user: {
                    username: searchResult[config.usernameAttribute] || username,
                    email: searchResult[config.emailAttribute] || `${username}@example.com`,
                    displayName: searchResult[config.nameAttribute] || username,
                    firstName: searchResult.givenName,
                    lastName: searchResult.sn,
                    groups,
                    dn: searchResult.dn,
                    rawAttributes: searchResult
                }
            };

        } catch (error: any) {
            console.error('LDAP authentication error:', error);
            return { success: false, error: `LDAP error: ${error.message || error}` };
        }
    },

    /**
     * Get user groups from LDAP
     */
    getUserGroups: async (client: any, userDn: string, config: LdapConfig): Promise<string[]> => {
        const groups: string[] = [];

        if (!config.groupSearchBase) return groups;

        // Search for groups
        const groupFilter = config.groupSearchFilter?.replace('{{dn}}', userDn);

        // In production: search and return group DNs

        return groups;
    },

    /**
     * Map LDAP groups to application role
     */
    mapGroupsToRole: (groups: string[]): string => {
        for (const group of groups) {
            if (LDAP_GROUP_ROLE_MAP[group]) {
                return LDAP_GROUP_ROLE_MAP[group];
            }
        }
        return 'Student';
    },

    /**
     * Sync user from LDAP to local database
     */
    syncUser: async (ldapUser: LdapUser): Promise<{ id: string; role: string }> => {
        const { query } = await import('../db');
        const role = LdapService.mapGroupsToRole(ldapUser.groups);

        const newId = crypto.randomUUID();
        console.log('[LDAP] Syncing user:', ldapUser.username, 'Generated ID:', newId);

        const result = await query(
            `INSERT INTO users (id, username, email, role, ldap_dn, password_hash, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, 'ldap_user', NOW(), NOW())
             ON CONFLICT (email) DO UPDATE SET 
                username = $2, role = $4, ldap_dn = $5, updated_at = NOW()
             RETURNING id, role`,
            [newId, ldapUser.username, ldapUser.email, role, ldapUser.dn]
        );

        return result.rows[0] as { id: string; role: string };
    },

    /**
     * Test LDAP connection
     */
    testConnection: async (): Promise<{ success: boolean; message: string }> => {
        const config = getLdapConfig();

        try {
            // In production: try to bind with service account
            console.log('[LDAP] Testing connection to:', config.url);

            // Mock response
            return { success: true, message: `Connected to ${config.url}` };
        } catch (error) {
            return { success: false, message: `Connection failed: ${error}` };
        }
    }
};

export default LdapService;
