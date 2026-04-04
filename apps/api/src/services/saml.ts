/**
 * SAML 2.0 SSO Service
 * Single Sign-On integration with SAML Identity Providers
 */

import { SAML } from '@node-saml/passport-saml';
import crypto from 'crypto';
import { query } from '../db';

interface SamlIdpConfig {
    entityId: string;
    ssoUrl: string;
    sloUrl?: string;
    certificate: string;
    signatureAlgorithm?: 'sha256' | 'sha512';
}

interface SamlSpConfig {
    entityId: string;
    assertionConsumerServiceUrl: string;
    singleLogoutServiceUrl?: string;
    privateKey?: string;
    certificate?: string;
    wantAssertionsSigned?: boolean;
    wantAuthnResponseSigned?: boolean;
}

interface SamlAssertion {
    nameId: string;
    nameIdFormat: string;
    sessionIndex?: string;
    attributes: {
        email?: string;
        firstName?: string;
        lastName?: string;
        displayName?: string;
        role?: string;
        groups?: string[];
        [key: string]: any;
    };
}

// Attribute mapping from SAML to our user model
const SAML_ATTRIBUTE_MAP = {
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress': 'email',
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname': 'firstName',
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname': 'lastName',
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name': 'displayName',
    'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': 'role',
    'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups': 'groups',
    // Common alternatives
    'email': 'email',
    'mail': 'email',
    'givenName': 'firstName',
    'sn': 'lastName',
    'displayName': 'displayName',
    'memberOf': 'groups'
};

const getSpConfig = (): SamlSpConfig => ({
    entityId: process.env.SAML_SP_ENTITY_ID || `${process.env.APP_URL}/saml/metadata`,
    assertionConsumerServiceUrl: `${process.env.APP_URL}/api/auth/saml/callback`,
    singleLogoutServiceUrl: `${process.env.APP_URL}/api/auth/saml/logout`,
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: true
});

export const SamlService = {
    /**
     * Get registered IdP configuration
     */
    getIdpConfig: async (idpId: string): Promise<SamlIdpConfig | null> => {
        try {
            const result = await query(
                'SELECT * FROM saml_idps WHERE id = $1 AND active = true',
                [idpId]
            );

            if (result.rows.length === 0) return null;

            const row = result.rows[0];
            return {
                entityId: row.entity_id,
                ssoUrl: row.sso_url,
                sloUrl: row.slo_url,
                certificate: row.certificate,
                signatureAlgorithm: row.signature_algorithm || 'sha256'
            };
        } catch (error) {
            console.error('Error fetching IdP config:', error);
            return null;
        }
    },

    /**
     * Register new IdP
     */
    registerIdp: async (config: SamlIdpConfig & { name: string }): Promise<string> => {
        const result = await query(
            `INSERT INTO saml_idps (name, entity_id, sso_url, slo_url, certificate, signature_algorithm, active)
             VALUES ($1, $2, $3, $4, $5, $6, true)
             RETURNING id`,
            [config.name, config.entityId, config.ssoUrl, config.sloUrl, config.certificate, config.signatureAlgorithm]
        );
        return result.rows[0].id;
    },

    /**
     * Generate SAML AuthnRequest
     */
    generateAuthnRequest: async (idpConfig: SamlIdpConfig, requestId?: string): Promise<{ url: string; requestId: string }> => {
        const sp = getSpConfig();

        const saml = new SAML({
            entryPoint: idpConfig.ssoUrl,
            issuer: sp.entityId,
            callbackUrl: sp.assertionConsumerServiceUrl,
            idpCert: idpConfig.certificate,
            signatureAlgorithm: idpConfig.signatureAlgorithm || 'sha256',
            wantAssertionsSigned: sp.wantAssertionsSigned,
            wantAuthnResponseSigned: sp.wantAuthnResponseSigned,
            // Additional config if needed
            disableRequestedAuthnContext: true
        });

        // getAuthorizeUrlAsync(requestId, host, options)
        const id = requestId || `_${crypto.randomBytes(16).toString('hex')}`;
        const url = await saml.getAuthorizeUrlAsync(id, sp.entityId, {});
        // Extract ID if possible or track it. The library handles ID generation. 
        // We might not get the exact ID back easily without parsing the generated URL, 
        // but for now let's just return the URL. The requestId in our interface was optional/internal use.
        // To be strictly correct with interface, let's extract it or generate one if library permits injection.
        // Library doesn't easily expose ID injection. Let's return a placeholder or parse it.
        const idMatch = decodeURIComponent(url).match(/ID="([^"]+)"/);
        const generatedId = idMatch ? idMatch[1] : (id || 'generated-by-lib');

        return {
            url,
            requestId: generatedId
        };
    },

    /**
     * Parse and validate SAML Response
     */
    parseResponse: async (samlResponse: string, idpId: string): Promise<{ valid: boolean; assertion?: SamlAssertion; error?: string }> => {
        try {
            const idpConfig = await SamlService.getIdpConfig(idpId);
            if (!idpConfig) {
                return { valid: false, error: 'Unknown IdP' };
            }

            const sp = getSpConfig();

            const saml = new SAML({
                entryPoint: idpConfig.ssoUrl,
                issuer: sp.entityId,
                callbackUrl: sp.assertionConsumerServiceUrl,
                idpCert: idpConfig.certificate,
                // startEncryptedAssertion property removed as it is not in type definition
                wantAssertionsSigned: true
            });

            // Construct a mock express request object as mostly expected by validatePostResponse
            const req = {
                body: {
                    SAMLResponse: samlResponse
                },
                query: {}
            };

            const check = await saml.validatePostResponseAsync(req as any);
            const { profile } = check;

            if (!profile) {
                return { valid: false, error: 'No profile found in SAML response' };
            }

            // Map profile to our assertion structure
            // profile object from library usually contains extracted attributes

            // Map attributes
            const attributes: SamlAssertion['attributes'] = {};
            // The library puts standard fields in profile, attributes in profile.attributes (depends on config)
            if (profile.attributes) {
                for (const [key, value] of Object.entries(profile.attributes)) {
                    const mappedName = (SAML_ATTRIBUTE_MAP as Record<string, string>)[key] || key;
                    attributes[mappedName] = value;
                }
            }

            // Fallback to top level properties if attributes missed
            if (!attributes.email && profile.email) attributes.email = profile.email as string;
            if (!attributes.nameId && profile.nameID) attributes.nameId = profile.nameID as string;

            return {
                valid: true,
                assertion: {
                    nameId: (profile.nameID as string) || (profile.email as string) || '',
                    nameIdFormat: (profile.nameIDFormat as string) || 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
                    attributes: {
                        ...attributes,
                        // Ensure we have something
                        email: (attributes.email as string) || (profile.email as string) || (profile.nameID as string)
                    }
                }
            };
        } catch (error: any) {
            console.error('SAML Parse Error:', error);
            return { valid: false, error: `Parse error: ${error.message || error}` };
        }
    },

    /**
     * Generate SP Metadata XML
     */
    generateMetadata: (): string => {
        const sp = getSpConfig();

        return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${sp.entityId}">
    <md:SPSSODescriptor AuthnRequestsSigned="true" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
        <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
        <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${sp.assertionConsumerServiceUrl}" index="0"/>
        ${sp.singleLogoutServiceUrl ? `<md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="${sp.singleLogoutServiceUrl}"/>` : ''}
    </md:SPSSODescriptor>
</md:EntityDescriptor>`;
    },

    /**
     * Create or update user from SAML assertion
     */
    provisionUser: async (assertion: SamlAssertion): Promise<{ id: string; role: string }> => {
        const { email, firstName, lastName, displayName, role, groups } = assertion.attributes;

        // Determine role from SAML attributes
        let userRole = 'Student';
        if (role) {
            userRole = role;
        } else if (groups && Array.isArray(groups)) {
            // Map groups to roles
            if (groups.some(g => g.toLowerCase().includes('admin'))) userRole = 'Admin';
            else if (groups.some(g => g.toLowerCase().includes('instructor') || g.toLowerCase().includes('teacher'))) userRole = 'Instructor';
        }

        const username = displayName || `${firstName} ${lastName}`.trim() || assertion.nameId;

        const result = await query(
            `INSERT INTO users (username, email, role, saml_name_id, created_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW())
             ON CONFLICT (email) DO UPDATE SET 
                username = $1, saml_name_id = $4, updated_at = NOW()
             RETURNING id, role`,
            [username, email, userRole, assertion.nameId]
        );

        return result.rows[0] as { id: string; role: string };
    },

    /**
     * Generate LogoutRequest
     */
    generateLogoutRequest: async (idpId: string, nameId: string, sessionIndex?: string): Promise<string | null> => {
        const idpConfig = await SamlService.getIdpConfig(idpId);
        if (!idpConfig || !idpConfig.sloUrl) return null;

        const sp = getSpConfig();
        const id = `_${crypto.randomBytes(16).toString('hex')}`;

        const logoutRequest = `
<samlp:LogoutRequest 
    xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="${id}"
    Version="2.0"
    IssueInstant="${new Date().toISOString()}"
    Destination="${idpConfig.sloUrl}">
    <saml:Issuer>${sp.entityId}</saml:Issuer>
    <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${nameId}</saml:NameID>
    ${sessionIndex ? `<samlp:SessionIndex>${sessionIndex}</samlp:SessionIndex>` : ''}
</samlp:LogoutRequest>`.trim();

        const encoded = Buffer.from(logoutRequest).toString('base64');
        return `${idpConfig.sloUrl}?SAMLRequest=${encodeURIComponent(encoded)}`;
    }
};

export default SamlService;
