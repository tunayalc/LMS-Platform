
import ldap from 'ldapjs';

const server = ldap.createServer();

server.bind('cn=admin,dc=example,dc=com', (req: any, res: any, next: any) => {
    if (req.dn.toString() !== 'cn=admin,dc=example,dc=com' || req.credentials !== 'admin') {
        return next(new ldap.InvalidCredentialsError());
    }
    res.end();
    return next();
});

server.search('dc=example,dc=com', (req: any, res: any, next: any) => {
    const obj = {
        dn: req.dn.toString(),
        attributes: {
            objectclass: ['top', 'person'],
            sAMAccountName: 'testuser',
            mail: 'test@example.com',
            displayName: 'Test User',
            givenName: 'Test',
            sn: 'User',
            memberOf: ['CN=Students,OU=Groups']
        }
    };

    if (req.filter.matches(obj.attributes)) {
        res.send(obj);
    }

    res.end();
    return next();
});

server.listen(1389, () => {
    console.log('🔮 Mock LDAP Server listening at ldap://localhost:1389');
    console.log('   - Bind DN: cn=admin,dc=example,dc=com');
    console.log('   - Password: admin');
});
