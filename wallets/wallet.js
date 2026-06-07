const db     = require("../connection/connection");
const crypto = require("crypto");

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

// platform fee percentage (5%) — adjust as needed
const PLATFORM_FEE_PCT = 0.05;

// ensure a wallet exists for an owner; creates one if not
const ensureWallet = (owner_id, owner_type, connection) =>
  new Promise((resolve, reject) => {
    connection.query(
      `INSERT IGNORE INTO wallets (owner_id, owner_type)
       VALUES (?, ?)`,
      [owner_id, owner_type],
      (err) => err ? reject(err) : resolve()
    );
  });

// ─────────────────────────────────────────────────────────
// GET WALLET BALANCE
// GET /api/wallet/balance
// ─────────────────────────────────────────────────────────
const getBalance = (req, res) => {
  const owner_id   = req.user.user_id || req.user.id;
  const owner_type = req.user.owner_type || "event_creator";

  db.query(
    `SELECT available_balance, pending_balance FROM wallets
     WHERE owner_id = ? AND owner_type = ?`,
    [owner_id, owner_type],
    (err, results) => {
      if (err) return res.status(500).json({ message: "DB error", err });

      if (!results.length) {
        // wallet not yet created — return zeroes
        return res.status(200).json({
          available_balance: "0.00",
          pending_balance:   "0.00",
        });
      }

      return res.status(200).json(results[0]);
    }
  );
};

// ─────────────────────────────────────────────────────────
// GET TRANSACTION HISTORY
// GET /api/wallet/transactions
// ─────────────────────────────────────────────────────────
const getTransactions = (req, res) => {
  const owner_id   = req.user.user_id || req.user.id;
  const owner_type = req.user.owner_type || "event_creator";
  const limit      = parseInt(req.query.limit)  || 20;
  const offset     = parseInt(req.query.offset) || 0;

  db.query(
    `SELECT id, amount, transaction_type, reference,
            description, status, created_at
     FROM wallet_transactions
     WHERE owner_id = ? AND owner_type = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [owner_id, owner_type, limit, offset],
    (err, results) => {
      if (err) return res.status(500).json({ message: "DB error", err });
      return res.status(200).json({ transactions: results });
    }
  );
};

// ─────────────────────────────────────────────────────────
// ADD BANK ACCOUNT
// POST /api/wallet/bank-account
// ─────────────────────────────────────────────────────────
const addBankAccount = (req, res) => {
  const owner_id   = req.user.user_id || req.user.id;
  const owner_type = req.user.owner_type || "event_creator";
  const { bank_name, account_name, account_number, is_default } = req.body;

  if (!bank_name || !account_name || !account_number) {
    return res.status(400).json({
      message: "bank_name, account_name and account_number are required"
    });
  }

  db.getConnection((err, connection) => {
    if (err) return res.status(500).json({ message: "DB connection error" });

    connection.beginTransaction(async (err) => {
      if (err) { connection.release(); return res.status(500).json({ message: "Transaction error" }); }

      try {
        // if this is being set as default, clear existing defaults first
        if (is_default !== false) {
          await new Promise((resolve, reject) => {
            connection.query(
              `UPDATE payout_bank_accounts SET is_default = FALSE
               WHERE owner_id = ? AND owner_type = ?`,
              [owner_id, owner_type],
              (err) => err ? reject(err) : resolve()
            );
          });
        }

        const result = await new Promise((resolve, reject) => {
          connection.query(
            `INSERT INTO payout_bank_accounts
               (owner_id, owner_type, bank_name, account_name, account_number, is_default)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [owner_id, owner_type, bank_name, account_name, account_number, is_default !== false],
            (err, result) => err ? reject(err) : resolve(result)
          );
        });

        connection.commit((err) => {
          connection.release();
          if (err) return res.status(500).json({ message: "Commit error" });
          console.log(`Bank account added for owner_id=${owner_id}: ${bank_name} - ${account_number}`);
          return res.status(201).json({
            message: "Bank account added successfully",
            account_id: result.insertId,
          });
        });
      } catch (error) {
        connection.rollback(() => connection.release());
        return res.status(500).json({ message: "Failed to add bank account", error });
      }
    });
  });
};

// ─────────────────────────────────────────────────────────
// GET BANK ACCOUNTS
// GET /api/wallet/bank-accounts
// ─────────────────────────────────────────────────────────
const getBankAccounts = (req, res) => {
  const owner_id   = req.user.user_id || req.user.id;
  const owner_type = req.user.owner_type || "event_creator";

  db.query(
    `SELECT id, bank_name, account_name, account_number, is_default, created_at
     FROM payout_bank_accounts
     WHERE owner_id = ? AND owner_type = ?
     ORDER BY is_default DESC, created_at DESC`,
    [owner_id, owner_type],
    (err, results) => {
      if (err) return res.status(500).json({ message: "DB error", err });
      return res.status(200).json({ bank_accounts: results });
    }
  );
};

// ─────────────────────────────────────────────────────────
// DELETE BANK ACCOUNT
// DELETE /api/wallet/bank-account/:id
// ─────────────────────────────────────────────────────────
const deleteBankAccount = (req, res) => {
  const owner_id   = req.user.user_id || req.user.id;
  const owner_type = req.user.owner_type || "event_creator";
  const { id }     = req.params;

  db.query(
    `DELETE FROM payout_bank_accounts
     WHERE id = ? AND owner_id = ? AND owner_type = ?`,
    [id, owner_id, owner_type],
    (err, result) => {
      if (err) return res.status(500).json({ message: "DB error", err });
      if (!result.affectedRows)
        return res.status(404).json({ message: "Bank account not found" });
      return res.status(200).json({ message: "Bank account removed" });
    }
  );
};

// ─────────────────────────────────────────────────────────
// REQUEST WITHDRAWAL
// POST /api/wallet/withdraw
// ─────────────────────────────────────────────────────────
const requestWithdrawal = (req, res) => {
  const owner_id   = req.user.user_id || req.user.id;
  const owner_type = req.user.owner_type || "event_creator";
  const { amount, bank_account_id } = req.body;

  if (!amount || !bank_account_id) {
    return res.status(400).json({ message: "amount and bank_account_id are required" });
  }

  if (parseFloat(amount) <= 0) {
    return res.status(400).json({ message: "Withdrawal amount must be greater than 0" });
  }

  db.getConnection((err, connection) => {
    if (err) return res.status(500).json({ message: "DB connection error" });

    connection.beginTransaction(async (err) => {
      if (err) { connection.release(); return res.status(500).json({ message: "Transaction error" }); }

      try {
        // 1. check available balance
        const wallet = await new Promise((resolve, reject) => {
          connection.query(
            `SELECT available_balance FROM wallets
             WHERE owner_id = ? AND owner_type = ?`,
            [owner_id, owner_type],
            (err, rows) => err ? reject(err) : resolve(rows[0])
          );
        });

        if (!wallet) throw { status: 404, message: "Wallet not found" };
        if (parseFloat(wallet.available_balance) < parseFloat(amount)) {
          throw { status: 400, message: `Insufficient balance. Available: ₦${wallet.available_balance}` };
        }

        // 2. verify bank account belongs to this owner
        const bankAccount = await new Promise((resolve, reject) => {
          connection.query(
            `SELECT id FROM payout_bank_accounts
             WHERE id = ? AND owner_id = ? AND owner_type = ?`,
            [bank_account_id, owner_id, owner_type],
            (err, rows) => err ? reject(err) : resolve(rows[0])
          );
        });

        if (!bankAccount) throw { status: 404, message: "Bank account not found" };

        // 3. deduct from available balance immediately (hold the funds)
        await new Promise((resolve, reject) => {
          connection.query(
            `UPDATE wallets
             SET available_balance = available_balance - ?
             WHERE owner_id = ? AND owner_type = ? AND available_balance >= ?`,
            [amount, owner_id, owner_type, amount],
            (err, result) => {
              if (err) return reject(err);
              if (!result.affectedRows) return reject({ status: 400, message: "Balance changed, please retry" });
              resolve();
            }
          );
        });

        // 4. create withdrawal request
        const result = await new Promise((resolve, reject) => {
          connection.query(
            `INSERT INTO withdrawal_requests
               (owner_id, owner_type, bank_account_id, amount, status)
             VALUES (?, ?, ?, ?, 'pending')`,
            [owner_id, owner_type, bank_account_id, amount],
            (err, result) => err ? reject(err) : resolve(result)
          );
        });

        // 5. log transaction
        await new Promise((resolve, reject) => {
          connection.query(
            `INSERT INTO wallet_transactions
               (owner_id, owner_type, amount, transaction_type, reference, description, status)
             VALUES (?, ?, ?, 'withdrawal', ?, 'Withdrawal request submitted', 'pending')`,
            [owner_id, owner_type, amount, `WD-${result.insertId}`],
            (err) => err ? reject(err) : resolve()
          );
        });

        connection.commit((err) => {
          connection.release();
          if (err) return res.status(500).json({ message: "Commit error" });
          return res.status(201).json({
            message: "Withdrawal request submitted successfully. Funds will be disbursed within 1-3 business days.",
            request_id: result.insertId,
          });
        });
      } catch (error) {
        connection.rollback(() => connection.release());
        const status = error.status || 500;
        return res.status(status).json({ message: error.message || "Withdrawal failed", error });
      }
    });
  });
};

// ─────────────────────────────────────────────────────────
// GET WITHDRAWAL HISTORY
// GET /api/wallet/withdrawals
// ─────────────────────────────────────────────────────────
const getWithdrawals = (req, res) => {
  const owner_id   = req.user.user_id || req.user.id;
  const owner_type = req.user.owner_type || "event_creator";

  db.query(
    `SELECT wr.id, wr.amount, wr.status, wr.rejection_reason,
            wr.created_at, wr.updated_at,
            pba.bank_name, pba.account_name, pba.account_number
     FROM withdrawal_requests wr
     JOIN payout_bank_accounts pba ON wr.bank_account_id = pba.id
     WHERE wr.owner_id = ? AND wr.owner_type = ?
     ORDER BY wr.created_at DESC`,
    [owner_id, owner_type],
    (err, results) => {
      if (err) return res.status(500).json({ message: "DB error", err });
      return res.status(200).json({ withdrawals: results });
    }
  );
};

// ─────────────────────────────────────────────────────────
// GET PENDING PAYOUTS (per event)
// GET /api/wallet/pending-payouts/:event_id
// ─────────────────────────────────────────────────────────
const getPendingPayouts = (req, res) => {
  const owner_id   = req.user.user_id || req.user.id;
  const owner_type = req.user.owner_type || "event_creator";
  const { event_id } = req.params;

  db.query(
    `SELECT id, gross_amount, platform_fee, net_amount,
            payment_reference, status, created_at, settled_at
     FROM pending_payouts
     WHERE owner_id = ? AND owner_type = ? AND event_id = ?
     ORDER BY created_at DESC`,
    [owner_id, owner_type, event_id],
    (err, results) => {
      if (err) return res.status(500).json({ message: "DB error", err });

      const total_pending = results
        .filter(r => r.status === "pending_verification")
        .reduce((sum, r) => sum + parseFloat(r.net_amount), 0);

      const total_settled = results
        .filter(r => r.status === "settled")
        .reduce((sum, r) => sum + parseFloat(r.net_amount), 0);

      return res.status(200).json({
        payouts: results,
        summary: {
          total_pending: total_pending.toFixed(2),
          total_settled: total_settled.toFixed(2),
        },
      });
    }
  );
};

// ─────────────────────────────────────────────────────────
// SETTLE PENDING PAYOUTS FOR AN EVENT (called internally
// after payment verification — not a route handler)
// ─────────────────────────────────────────────────────────
const settleEventPayouts = async (event_id, owner_id, owner_type, connection) => {
  // get all pending_verification payouts for this event
  const payouts = await new Promise((resolve, reject) => {
    connection.query(
      `SELECT id, net_amount FROM pending_payouts
       WHERE event_id = ? AND owner_id = ? AND owner_type = ?
         AND status = 'pending_verification'`,
      [event_id, owner_id, owner_type],
      (err, rows) => err ? reject(err) : resolve(rows)
    );
  });

  if (!payouts.length) return;

  const totalNet = payouts.reduce((sum, p) => sum + parseFloat(p.net_amount), 0);
  const payoutIds = payouts.map(p => p.id);

  // move pending_balance → available_balance
  await new Promise((resolve, reject) => {
    connection.query(
      `UPDATE wallets
       SET available_balance = available_balance + ?,
           pending_balance   = GREATEST(pending_balance - ?, 0)
       WHERE owner_id = ? AND owner_type = ?`,
      [totalNet, totalNet, owner_id, owner_type],
      (err) => err ? reject(err) : resolve()
    );
  });

  // mark payouts as settled
  await new Promise((resolve, reject) => {
    connection.query(
      `UPDATE pending_payouts
       SET status = 'settled', settled_at = NOW()
       WHERE id IN (?)`,
      [payoutIds],
      (err) => err ? reject(err) : resolve()
    );
  });

  // log settlement transaction
  await new Promise((resolve, reject) => {
    connection.query(
      `INSERT INTO wallet_transactions
         (owner_id, owner_type, amount, transaction_type,
          reference, description, status)
       VALUES (?, ?, ?, 'settlement', ?, ?, 'successful')`,
      [
        owner_id, owner_type, totalNet,
        `SETTLE-EVT-${event_id}`,
        `Settlement for ${payouts.length} ticket sale(s) on event #${event_id}`,
      ],
      (err) => err ? reject(err) : resolve()
    );
  });
};

// ─────────────────────────────────────────────────────────
// CREDIT WALLET ON TICKET SALE (called inside verifyPayment)
// Credits available_balance directly — payment is already
// verified by Paystack before this is called.
// Silently skips if the organizer has no wallet yet.
// ─────────────────────────────────────────────────────────
const creditWalletForTicketSale = async ({
  connection,
  owner_id,
  owner_type,
  event_id,
  ticket_id,
  customer_email,
  gross_amount,
  payment_reference,
}) => {
  const platform_fee = parseFloat((gross_amount * PLATFORM_FEE_PCT).toFixed(2));
  const net_amount   = parseFloat((gross_amount - platform_fee).toFixed(2));

  // check if wallet exists — do NOT auto-create
  const walletExists = await new Promise((resolve, reject) => {
    connection.query(
      `SELECT id FROM wallets WHERE owner_id = ? AND owner_type = ?`,
      [owner_id, owner_type],
      (err, rows) => err ? reject(err) : resolve(rows.length > 0)
    );
  });

  if (!walletExists) {
    // organizer hasn't created a wallet yet — log and skip silently
    console.warn(`Wallet not found for owner_id=${owner_id}. Skipping wallet credit.`);
    return { gross_amount, platform_fee, net_amount, credited: false };
  }

  // credit available_balance directly — payment is already verified
  await new Promise((resolve, reject) => {
    connection.query(
      `UPDATE wallets
       SET available_balance = available_balance + ?
       WHERE owner_id = ? AND owner_type = ?`,
      [net_amount, owner_id, owner_type],
      (err) => err ? reject(err) : resolve()
    );
  });

  // log as successful ticket_sale transaction
  // INSERT IGNORE prevents duplicate logs if webhook + verify both fire
  await new Promise((resolve, reject) => {
    connection.query(
      `INSERT IGNORE INTO wallet_transactions
         (owner_id, owner_type, amount, transaction_type,
          reference, description, status)
       VALUES (?, ?, ?, 'ticket_sale', ?, ?, 'successful')`,
      [
        owner_id, owner_type, net_amount, payment_reference,
        `Ticket sale for event #${event_id} — ₦${net_amount.toLocaleString()} credited (₦${platform_fee.toLocaleString()} platform fee deducted)`,
      ],
      (err) => err ? reject(err) : resolve()
    );
  });

  // record in pending_payouts as settled immediately
  await new Promise((resolve, reject) => {
    connection.query(
      `INSERT INTO pending_payouts
         (owner_id, owner_type, event_id, ticket_id, customer_email,
          gross_amount, platform_fee, net_amount, payment_reference, status, settled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'settled', NOW())`,
      [owner_id, owner_type, event_id, ticket_id, customer_email,
       gross_amount, platform_fee, net_amount, payment_reference],
      (err) => err ? reject(err) : resolve()
    );
  });

  return { gross_amount, platform_fee, net_amount, credited: true };
};

// ─────────────────────────────────────────────────────────
// GET PENDING PAYMENTS (ticket purchases not yet verified)
// GET /api/wallet/pending-payments
// These are payments initialized with Paystack but where
// verifyPayment has not been called yet — i.e. the user
// opened the Paystack page but hasn't completed or the
// frontend hasn't called verify yet.
// ─────────────────────────────────────────────────────────
const getPendingPayments = (req, res) => {
  const owner_id   = req.user.user_id || req.user.id;
  const owner_type = req.user.owner_type || "event_creator";

  // join payments → events so we only return payments
  // for events owned by this creator
  db.query(
    `SELECT
       p.id,
       p.reference,
       p.user_id       AS buyer_id,
       p.event_id,
       e.event_name,
       p.ticket_type,
       p.quantity,
       p.amount,
       p.status,
       p.payment_gateway,
       p.paid_at
     FROM payments p
     JOIN events e ON p.event_id = e.id
     WHERE e.creator_id = ?
       AND p.status = 'pending'
     ORDER BY p.paid_at DESC`,
    [owner_id],
    (err, results) => {
      if (err) return res.status(500).json({ message: "DB error", err });

      const total_pending_amount = results
        .reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);

      return res.status(200).json({
        count:                 results.length,
        total_pending_amount:  total_pending_amount.toFixed(2),
        pending_payments:      results,
      });
    }
  );
};

// ─────────────────────────────────────────────────────────
// CREATE WALLET (organizer must do this explicitly)
// POST /api/wallet/create
// ─────────────────────────────────────────────────────────
const createWallet = (req, res) => {
  const owner_id   = req.user.user_id || req.user.id;
  const owner_type = req.user.owner_type || "event_creator";

  // check if already exists
  db.query(
    `SELECT id FROM wallets WHERE owner_id = ? AND owner_type = ?`,
    [owner_id, owner_type],
    (err, results) => {
      if (err) return res.status(500).json({ message: "DB error", err });

      if (results.length > 0) {
        return res.status(409).json({ message: "Wallet already exists" });
      }

      db.query(
        `INSERT INTO wallets (owner_id, owner_type, available_balance, pending_balance)
         VALUES (?, ?, 0.00, 0.00)`,
        [owner_id, owner_type],
        (err, result) => {
          if (err) return res.status(500).json({ message: "Failed to create wallet", err });
          return res.status(201).json({
            message: "Wallet created successfully",
            wallet_id: result.insertId,
          });
        }
      );
    }
  );
};

module.exports = {
  createWallet,
  getBalance,
  getTransactions,
  addBankAccount,
  getBankAccounts,
  deleteBankAccount,
  requestWithdrawal,
  getWithdrawals,
  getPendingPayouts,
  getPendingPayments,
  creditWalletForTicketSale,
  settleEventPayouts,
};