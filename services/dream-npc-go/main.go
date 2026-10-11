package main

import (
	"crypto/subtle"
	"log"
	"os"
	"time"

	"github.com/club-mutant/dream-npc-go/npc"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env if it exists
	_ = godotenv.Load()

	port := os.Getenv("PORT")
	if port == "" {
		port = "4000"
	}

	// Initialize inner life systems
	stateMgr := npc.NewStateManager()
	npc.SetStateManager(stateMgr)

	dbPath := os.Getenv("DUALMEM_DB_PATH")
	if dbPath == "" {
		dbPath = "./data/dualmem.db"
	}
	relStore, err := npc.NewRelationshipStore(dbPath)
	if err != nil {
		log.Printf("[relationships] Init failed: %v — relationships disabled", err)
	} else {
		npc.SetRelationshipStore(relStore)
		defer relStore.Close()
	}

	heartbeatHandler := npc.NewHeartbeatHandler(stateMgr, relStore)

	app := fiber.New(fiber.Config{
		DisableStartupMessage: true,
		BodyLimit:             32 * 1024, ReadTimeout: 10 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second,
	})

	app.Use(recover.New())
	app.Use(logger.New())
	token := os.Getenv("INTERNAL_SERVICE_TOKEN")
	if len(token) < 32 {
		log.Fatal("INTERNAL_SERVICE_TOKEN must have at least 32 characters")
	}
	app.Use(func(c *fiber.Ctx) error {
		if c.Path() == "/health" {
			return c.Next()
		}
		if c.Path() == "/dream/npc-chat" {
			return c.SendStatus(fiber.StatusNotFound)
		}
		if subtle.ConstantTimeCompare([]byte(c.Get("Authorization")), []byte("Bearer "+token)) != 1 {
			return c.SendStatus(fiber.StatusUnauthorized)
		}
		return c.Next()
	})

	app.Use(cors.New(cors.Config{
		AllowOrigins: "http://localhost:5176, http://localhost:5175, http://localhost:2567, http://127.0.0.1:5176, http://127.0.0.1:5175, http://127.0.0.1:2567, https://mutante.club, https://api.mutante.club",
		AllowHeaders: "Content-Type",
		AllowMethods: "GET, POST, OPTIONS",
	}))

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":  "ok",
			"service": "dream-npc-go",
		})
	})

	app.Post("/dream/npc-chat", func(c *fiber.Ctx) error {
		ip := c.IP()
		if ips := c.IPs(); len(ips) > 0 {
			ip = ips[0]
		}
		sessionKey := "dream:" + ip

		return handleIncomingChat(c, sessionKey)
	})

	app.Post("/bartender/npc-chat", func(c *fiber.Ctx) error {
		var body npc.NpcChatRequest
		if err := c.BodyParser(&body); err == nil && body.RoomID != "" {
			return handleIncomingChat(c, "bartender:"+body.RoomID)
		}
		return handleIncomingChat(c, "bartender:default")
	})

	app.Post("/bartender/heartbeat", func(c *fiber.Ctx) error {
		var snapshot npc.WorldSnapshot
		if err := c.BodyParser(&snapshot); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid JSON"})
		}
		if len(snapshot.Players) > 50 || len(snapshot.RecentMessages) > 25 {
			return c.SendStatus(400)
		}
		if !npc.ReserveHeartbeat() {
			return c.SendStatus(429)
		}
		result := heartbeatHandler.HandleHeartbeat("lily_bartender", snapshot)
		return c.JSON(result)
	})

	log.Printf("🌙 Dream NPC Go service listening on http://localhost:%s\n", port)
	log.Fatal(app.Listen(":" + port))
}

func handleIncomingChat(c *fiber.Ctx, sessionKey string) error {
	var req npc.NpcChatRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid JSON"})
	}

	if len(req.Message) > 4000 || len(req.History) > 25 || len(req.PlayerID) > 128 || len(req.RoomID) > 64 {
		return c.SendStatus(400)
	}
	status, res := npc.HandleNpcChat(req, sessionKey)
	return c.Status(status).JSON(res)
}
