/*
  Server HTTP nhận dữ liệu cảm biến từ ESP32 (Cloud Deploy + Aiven MySQL)
*/

const express = require("express");
const cors = require("cors");
const path = require("path");
const mysql = require("mysql2/promise");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------- CẤU HÌNH KẾT NỐI MYSQL AIVEN ----------------
const DB_HOST = process.env.DB_HOST || "mysql-69ce77a-pbl3.c.aivencloud.com";
const DB_PORT = process.env.DB_PORT || 26065;
const DB_USER = process.env.DB_USER || "avnadmin";

// >>> THAY MẬT KHẨU CỦA ĐẠI CA VÀO ĐÂY <<<
const DB_PASSWORD = process.env.DB_PASSWORD || "AVNS_gDxfA3H7NGinJk-ec41";
const DB_NAME = process.env.DB_NAME || "defaultdb";
// -------------------------------------------------------------

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let pool;

async function initDB() {
  pool = mysql.createPool({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    ssl: {
      rejectUnauthorized: false
    },
    waitForConnections: true,
    connectionLimit: 10,
  });

  const conn = await pool.getConnection();
  console.log("Da ket noi MySQL Aiven thanh cong -> database:", DB_NAME);

  // TỰ ĐỘNG TẠO BẢNG SENSOR_DATA NẾU CHƯA CÓ
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS sensor_data (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      group_name   VARCHAR(100),
      heart_rate   INT,
      spo2         INT,
      body_temp    FLOAT,
      room_temp    FLOAT,
      humidity     FLOAT,
      alert_status TINYINT(1) DEFAULT 0,
      received_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("Da kiem tra va khoi tao bang sensor_data san sang!");
  conn.release();
}

// ---------- API: ESP32 gửi dữ liệu tới đây (POST) ----------
app.post("/api/sensor-data", async (req, res) => {
  const b = req.body || {};
  try {
    await pool.execute(
      `INSERT INTO sensor_data
        (group_name, heart_rate, spo2, body_temp, room_temp, humidity, alert_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        b.group ?? null,
        b.heartRate ?? null,
        b.spo2 ?? null,
        b.bodyTemp ?? null,
        b.roomTemp ?? null,
        b.humidity ?? null,
        b.alert ? 1 : 0,
      ]
    );

    console.log(
      `[${new Date().toISOString()}] Da luu vao MySQL Aiven: HR=${b.heartRate}, SpO2=${b.spo2}, ` +
      `BodyTemp=${b.bodyTemp}, RoomTemp=${b.roomTemp}, Humidity=${b.humidity}, Alert=${b.alert}`
    );

    res.json({ status: "ok" });
  } catch (err) {
    console.error("Loi ghi MySQL:", err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ---------- API: web dashboard lấy danh sách 200 bản ghi ----------
app.get("/api/sensor-data", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         group_name   AS \`group\`,
         heart_rate   AS heartRate,
         spo2,
         body_temp    AS bodyTemp,
         room_temp    AS roomTemp,
         humidity,
         alert_status AS alert,
         received_at  AS receivedAt
       FROM sensor_data
       ORDER BY id DESC
       LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    console.error("Loi doc MySQL:", err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Endpoint UptimeRobot ping chống ngủ đông
app.get("/ping", (req, res) => {
  res.send("PONG");
});

initDB()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server dang chay tren cong: ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("KHONG KET NOI DUOC MYSQL AIVEN:", err.message);
    process.exit(1);
  });