// Definizione ruoli e permessi del sistema
export const USER_ROLES = {
  DEALER: 'dealer',
  MASTER: 'master',
  MASTER_PRODOTTI: 'master_prodotti',
  AGENTE: 'agente',
  SUPER_MASTER: 'super_master',
  ADMIN: 'admin'
};

// Mappa dei permessi per ogni ruolo
export const ROLE_PERMISSIONS = {
  [USER_ROLES.DEALER]: [
    'view_dealer_dashboard',
    'manage_own_clients',
    'view_own_reports',
    'edit_own_profile'
  ],
  [USER_ROLES.MASTER]: [
    'view_master_dashboard',
    'manage_dealers',
    'view_dealer_reports',
    'manage_own_clients',
    'view_analytics'
  ],
  [USER_ROLES.MASTER_PRODOTTI]: [
    'view_products_dashboard',
    'manage_products',
    'view_product_analytics',
    'manage_inventory',
    'set_pricing'
  ],
  [USER_ROLES.AGENTE]: [
    'view_agent_dashboard',
    'manage_leads',
    'view_commission',
    'contact_clients'
  ],
  [USER_ROLES.SUPER_MASTER]: [
    'view_super_dashboard',
    'manage_all_users',
    'view_all_reports',
    'manage_masters',
    'system_settings',
    'financial_overview'
  ],
  [USER_ROLES.ADMIN]: [
    'view_admin_dashboard',
    'full_system_access',
    'manage_all_users',
    'system_configuration',
    'security_settings',
    'audit_logs'
  ]
};

// Gerarchia dei ruoli (per controlli di accesso)
export const ROLE_HIERARCHY = {
  [USER_ROLES.ADMIN]: 6,
  [USER_ROLES.SUPER_MASTER]: 5,
  [USER_ROLES.MASTER]: 4,
  [USER_ROLES.MASTER_PRODOTTI]: 3,
  [USER_ROLES.DEALER]: 2,
  [USER_ROLES.AGENTE]: 1
};

// Helper functions
export const hasPermission = (userRole, permission) => {
  return ROLE_PERMISSIONS[userRole]?.includes(permission) || false;
};

export const hasRoleAccess = (userRole, requiredRole) => {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
};
