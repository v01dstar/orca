// Why not in RUNTIME_CAPABILITIES: advertised only by `orca serve --trusted-issuer-file`, whose
// `e2ee_auth` accepts `hangarAssertion` in place of `deviceToken`. Wire names predate the Instabox
// rename; deployed orca templates still speak them, so they stay.
export const INSTABOX_ASSERTION_AUTH_RUNTIME_CAPABILITY = 'auth.hangar-assertion.v1' as const
