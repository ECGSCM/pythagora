// Environment variable validation
const requiredEnvVars = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

const validateEnv = () => {
  const missing = requiredEnvVars.filter(key => !import.meta.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please copy .env.example to .env and fill in the required values.'
    );
  }
};

// Validate on import
validateEnv();

export const config = {
  supabase: {
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY
  },
  app: {
    name: import.meta.env.VITE_APP_NAME || 'Pythagora Synth',
    url: import.meta.env.VITE_APP_URL || window.location.origin,
    env: import.meta.env.VITE_APP_ENV || 'development'
  },
  features: {
    pwa: import.meta.env.VITE_ENABLE_PWA !== 'false',
    analytics: import.meta.env.VITE_ENABLE_ANALYTICS === 'true'
  },
  security: {
    csp: import.meta.env.VITE_ENABLE_CSP !== 'false',
    reportOnly: import.meta.env.VITE_CSP_REPORT_ONLY === 'true'
  }
} as const;

export type Config = typeof config;
