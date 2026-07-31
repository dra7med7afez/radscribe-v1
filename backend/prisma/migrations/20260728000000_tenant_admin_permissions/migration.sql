INSERT INTO `Permission` (`id`, `action`, `resource`)
VALUES
  ('perm-manage-users', 'manage', 'users'),
  ('perm-manage-billing', 'manage', 'billing'),
  ('perm-manage-plans', 'manage', 'plans'),
  ('perm-sign-reports', 'sign', 'reports')
ON DUPLICATE KEY UPDATE `id` = `id`;

INSERT INTO `Role` (`id`, `name`, `description`)
VALUES ('role-platform-admin', 'PLATFORM_ADMIN', 'Platform-wide operations')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

UPDATE `Role`
SET `description` = 'Organization administrator'
WHERE `name` = 'ADMIN';

INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionId`)
SELECT r.`id`, p.`id`
FROM `Role` r
JOIN `Permission` p
  ON (r.`name` = 'PLATFORM_ADMIN' AND p.`action` = 'manage' AND p.`resource` = '*')
  OR (r.`name` = 'ADMIN' AND p.`action` = 'manage' AND p.`resource` IN ('users', 'billing'))
  OR (r.`name` IN ('ADMIN', 'RADIOLOGIST') AND p.`action` = 'sign' AND p.`resource` = 'reports');

INSERT IGNORE INTO `UserRole` (`userId`, `roleId`)
SELECT u.`id`, r.`id`
FROM `User` u
JOIN `Organization` o ON o.`id` = u.`organizationId`
JOIN `Role` r ON r.`name` = 'PLATFORM_ADMIN'
WHERE o.`name` = 'System administration';

DELETE rp
FROM `RolePermission` rp
JOIN `Role` r ON r.`id` = rp.`roleId`
JOIN `Permission` p ON p.`id` = rp.`permissionId`
WHERE r.`name` = 'ADMIN' AND p.`action` = 'manage' AND p.`resource` = '*';
