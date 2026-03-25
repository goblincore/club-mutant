package main

import (
	"log"
	"os"

	"github.com/club-mutant/dream-npc-go/npc"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
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
	})

	app.Use(logger.New())

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

	status, res := npc.HandleNpcChat(req, sessionKey)
	return c.Status(status).JSON(res)
}
