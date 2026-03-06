import { Dropbox } from 'dropbox';

export function getClient(): Dropbox {
    const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;
    const clientId = process.env.DROPBOX_APP_KEY;
    const clientSecret = process.env.DROPBOX_APP_SECRET;

    if (!refreshToken || !clientId || !clientSecret) {
        console.error(
            'Missing environment variables. Required: DROPBOX_REFRESH_TOKEN, DROPBOX_APP_KEY, DROPBOX_APP_SECRET.\n' +
                'Run `storage-cli auth` to obtain a refresh token, then securely store all three.',
        );
        process.exit(1);
    }

    return new Dropbox({ refreshToken, clientId, clientSecret });
}
