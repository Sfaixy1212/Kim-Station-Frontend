-- Tabella per memorizzare i target degli agenti per anno
CREATE TABLE tbTargetAgenti (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    AgenteId UNIQUEIDENTIFIER NOT NULL,
    Anno INT NOT NULL,
    TargetEnergy INT DEFAULT 0,
    TargetFissi INT DEFAULT 0,
    PremioEnergy DECIMAL(10,2) DEFAULT 0,
    PremioFissi DECIMAL(10,2) DEFAULT 0,
    TargetCore INT DEFAULT 100,
    TargetRA INT DEFAULT 150,
    DataCreazione DATETIME2 DEFAULT GETDATE(),
    DataModifica DATETIME2 DEFAULT GETDATE(),
    
    -- Constraints
    CONSTRAINT FK_tbTargetAgenti_AspNetUsers FOREIGN KEY (AgenteId) REFERENCES AspNetUsers(Id),
    CONSTRAINT UQ_tbTargetAgenti_AgenteAnno UNIQUE (AgenteId, Anno)
);

-- Indici per performance
CREATE INDEX IX_tbTargetAgenti_AgenteId ON tbTargetAgenti(AgenteId);
CREATE INDEX IX_tbTargetAgenti_Anno ON tbTargetAgenti(Anno);

-- Inserimento dati di esempio per agenti esistenti
INSERT INTO tbTargetAgenti (AgenteId, Anno, TargetEnergy, TargetFissi, PremioEnergy, PremioFissi, TargetCore, TargetRA)
SELECT 
    u.Id,
    2025 as Anno,
    CASE 
        WHEN u.UserName LIKE '%giacomo%' THEN 30
        WHEN u.UserName LIKE '%gigi%' THEN 10
        ELSE 0
    END as TargetEnergy,
    CASE 
        WHEN u.UserName LIKE '%giacomo%' THEN 100
        WHEN u.UserName LIKE '%gigi%' THEN 20
        ELSE 0
    END as TargetFissi,
    CASE 
        WHEN u.UserName LIKE '%giacomo%' THEN 300.00
        WHEN u.UserName LIKE '%gigi%' THEN 150.00
        ELSE 0.00
    END as PremioEnergy,
    CASE 
        WHEN u.UserName LIKE '%giacomo%' THEN 800.00
        WHEN u.UserName LIKE '%gigi%' THEN 200.00
        ELSE 0.00
    END as PremioFissi,
    100 as TargetCore,
    150 as TargetRA
FROM AspNetUsers u
WHERE EXISTS (
    SELECT 1 FROM AspNetUserRoles ur 
    JOIN AspNetRoles r ON ur.RoleId = r.Id 
    WHERE ur.UserId = u.Id AND r.Name = 'agenti'
)
AND NOT EXISTS (
    SELECT 1 FROM tbTargetAgenti t WHERE t.AgenteId = u.Id AND t.Anno = 2025
);

-- Trigger per aggiornare DataModifica
CREATE TRIGGER TR_tbTargetAgenti_UpdateModifica
ON tbTargetAgenti
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE tbTargetAgenti 
    SET DataModifica = GETDATE()
    FROM tbTargetAgenti t
    INNER JOIN inserted i ON t.Id = i.Id;
END;
