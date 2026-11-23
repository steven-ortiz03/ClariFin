CREATE TABLE IF NOT EXISTS usuarios (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(90) NOT NULL,
 email VARCHAR(190) NOT NULL UNIQUE, passwordHash VARCHAR(255) NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS sesiones (
 tokenHash CHAR(64) PRIMARY KEY, userId INT UNSIGNED NOT NULL,
 csrf CHAR(64) NOT NULL, expiresAt DATETIME NOT NULL, INDEX(expiresAt),
 FOREIGN KEY(userId) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS cuentas (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, userId INT UNSIGNED NOT NULL,
 name VARCHAR(90) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
 UNIQUE(userId,id), UNIQUE(userId,name), FOREIGN KEY(userId) REFERENCES usuarios(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS categorias (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, userId INT UNSIGNED NOT NULL,
 name VARCHAR(90) NOT NULL, type ENUM('income','expense') NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE, preset BOOLEAN NOT NULL DEFAULT FALSE,
 UNIQUE(userId,id), UNIQUE(userId,type,name), FOREIGN KEY(userId) REFERENCES usuarios(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS programaciones_recurrentes (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, userId INT UNSIGNED NOT NULL,
 name VARCHAR(90) NOT NULL, categoryId INT UNSIGNED NOT NULL,
 estimatedAmount DECIMAL(15,2) NOT NULL CHECK(estimatedAmount>0),
 dueDay TINYINT UNSIGNED NOT NULL CHECK(dueDay BETWEEN 1 AND 31),
 startDate DATE NOT NULL, nextMonth DATE NOT NULL, isVariable BOOLEAN NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE, UNIQUE(userId,id),
 FOREIGN KEY(userId,categoryId) REFERENCES categorias(userId,id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS compromisos (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, userId INT UNSIGNED NOT NULL,
 scheduleId INT UNSIGNED NOT NULL, name VARCHAR(90) NOT NULL,
 categoryId INT UNSIGNED NOT NULL, period DATE NOT NULL, dueDate DATE NOT NULL,
 expected DECIMAL(15,2) NOT NULL CHECK(expected>0), isVariable BOOLEAN NOT NULL,
 UNIQUE(userId,id), UNIQUE(scheduleId,period), INDEX(userId,dueDate),
 FOREIGN KEY(userId,scheduleId) REFERENCES programaciones_recurrentes(userId,id),
 FOREIGN KEY(userId,categoryId) REFERENCES categorias(userId,id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS movimientos (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, userId INT UNSIGNED NOT NULL,
 type ENUM('income','expense','transfer','adjustment','opening') NOT NULL,
 accountId INT UNSIGNED NOT NULL, destinationId INT UNSIGNED, categoryId INT UNSIGNED,
 commitmentId INT UNSIGNED, amount DECIMAL(15,2) NOT NULL, date DATE NOT NULL,
 description VARCHAR(240) NOT NULL DEFAULT '', voided BOOLEAN NOT NULL DEFAULT FALSE,
 version INT UNSIGNED NOT NULL DEFAULT 1, UNIQUE(userId,id),
 INDEX(userId,date,id), INDEX(userId,categoryId,date), INDEX(userId,commitmentId),
 FOREIGN KEY(userId,accountId) REFERENCES cuentas(userId,id),
 FOREIGN KEY(userId,destinationId) REFERENCES cuentas(userId,id),
 FOREIGN KEY(userId,categoryId) REFERENCES categorias(userId,id),
 FOREIGN KEY(userId,commitmentId) REFERENCES compromisos(userId,id),
 CHECK((type IN ('income','expense') AND categoryId IS NOT NULL) OR
       (type NOT IN ('income','expense') AND categoryId IS NULL)),
 CHECK((type='transfer' AND destinationId IS NOT NULL AND destinationId<>accountId) OR
       (type<>'transfer' AND destinationId IS NULL)),
 CHECK(commitmentId IS NULL OR type='expense'),
 CHECK(type IN ('opening','adjustment') OR amount>0)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS presupuestos (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, userId INT UNSIGNED NOT NULL,
 categoryId INT UNSIGNED NOT NULL, period DATE NOT NULL,
 limitAmount DECIMAL(15,2) NOT NULL CHECK(limitAmount>0),
 UNIQUE(userId,categoryId,period), UNIQUE(userId,id),
 FOREIGN KEY(userId,categoryId) REFERENCES categorias(userId,id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS alertas (
 budgetId INT UNSIGNED NOT NULL, threshold TINYINT NOT NULL CHECK(threshold IN (80,100)),
 createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(budgetId,threshold),
 FOREIGN KEY(budgetId) REFERENCES presupuestos(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS operaciones_idempotentes (
 userId INT UNSIGNED NOT NULL, operationKey VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 fingerprint CHAR(64) NOT NULL, result JSON NOT NULL,
 PRIMARY KEY(userId,operationKey), FOREIGN KEY(userId) REFERENCES usuarios(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS auditoria_movimientos (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, userId INT UNSIGNED NOT NULL,
 movementId INT UNSIGNED, commitmentId INT UNSIGNED, action VARCHAR(32) NOT NULL,
 previousValue JSON, newValue JSON, createdAt TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(userId,movementId) REFERENCES movimientos(userId,id),
 FOREIGN KEY(userId,commitmentId) REFERENCES compromisos(userId,id),
 CHECK((movementId IS NULL)<>(commitmentId IS NULL))
) ENGINE=InnoDB;
CREATE OR REPLACE VIEW apuntes AS
 SELECT userId,id AS movementId,date,accountId,
 CASE WHEN type IN ('expense','transfer') THEN -amount ELSE amount END AS delta
 FROM movimientos WHERE voided=0
 UNION ALL SELECT userId,id,date,destinationId,amount FROM movimientos WHERE voided=0 AND type='transfer';
CREATE OR REPLACE VIEW progreso AS
 SELECT p.*,c.name AS categoryName,
 COALESCE((SELECT SUM(m.amount) FROM movimientos m WHERE m.userId=p.userId AND m.categoryId=p.categoryId
 AND m.type='expense' AND m.voided=0 AND m.date>=p.period AND m.date<DATE_ADD(p.period,INTERVAL 1 MONTH)),0.00) AS used
 FROM presupuestos p JOIN categorias c ON c.id=p.categoryId;
CREATE OR REPLACE VIEW cartera AS
 SELECT c.*,COALESCE((SELECT SUM(m.amount) FROM movimientos m WHERE m.commitmentId=c.id AND m.voided=0),0.00) AS paid,
 EXISTS(SELECT 1 FROM movimientos m WHERE m.commitmentId=c.id) AS hasPayments
 FROM compromisos c;
