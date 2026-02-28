// cogmem-inspect — CLI tool to browse the cognitive memory SQLite database.
//
// Usage:
//
//	go run ./cmd/cogmem-inspect                     # list all memories
//	go run ./cmd/cogmem-inspect -user lily_bartender:abc123   # filter by user
//	go run ./cmd/cogmem-inspect -sector emotional   # filter by sector
//	go run ./cmd/cogmem-inspect -waypoints          # show waypoint graph
//	go run ./cmd/cogmem-inspect -stats              # show summary stats
//	go run ./cmd/cogmem-inspect -db ./other.db      # use a different db
package main

import (
	"database/sql"
	"flag"
	"fmt"
	"os"
	"strings"
	"text/tabwriter"

	_ "modernc.org/sqlite"
)

func main() {
	dbPath := flag.String("db", "./data/cogmem.db", "path to cogmem SQLite database")
	user := flag.String("user", "", "filter by user_id (e.g. lily_bartender:player123)")
	sector := flag.String("sector", "", "filter by sector (episodic, semantic, procedural, emotional, reflective)")
	showWaypoints := flag.Bool("waypoints", false, "show waypoint graph and associations")
	showStats := flag.Bool("stats", false, "show summary statistics")
	limit := flag.Int("limit", 50, "max memories to show")
	flag.Parse()

	if _, err := os.Stat(*dbPath); os.IsNotExist(err) {
		fmt.Fprintf(os.Stderr, "Database not found: %s\n", *dbPath)
		fmt.Fprintf(os.Stderr, "Run the dream-npc server with GEMINI_API_KEY set to create it.\n")
		os.Exit(1)
	}

	db, err := sql.Open("sqlite", *dbPath+"?mode=ro")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error opening database: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	if *showStats {
		printStats(db)
		return
	}

	if *showWaypoints {
		printWaypoints(db)
		return
	}

	printMemories(db, *user, *sector, *limit)
}

func printMemories(db *sql.DB, user, sector string, limit int) {
	query := `
		SELECT m.id, m.user_id, m.sector, m.salience, m.decay_score,
		       m.access_count, m.last_accessed_at, m.created_at,
		       m.summary, substr(m.content, 1, 120)
		FROM memories m
		WHERE 1=1`
	var args []any

	if user != "" {
		query += " AND m.user_id = ?"
		args = append(args, user)
	}
	if sector != "" {
		query += " AND m.sector = ?"
		args = append(args, sector)
	}

	query += " ORDER BY m.created_at DESC LIMIT ?"
	args = append(args, limit)

	rows, err := db.Query(query, args...)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Query error: %v\n", err)
		os.Exit(1)
	}
	defer rows.Close()

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "ID\tUSER\tSECTOR\tSALIENCE\tDECAY\tACCESS\tLAST ACCESSED\tCREATED\tSUMMARY")
	fmt.Fprintln(w, "──\t────\t──────\t────────\t─────\t──────\t─────────────\t───────\t───────")

	count := 0
	for rows.Next() {
		var id int64
		var userID, sectorVal, lastAccessed, created, summary, content string
		var salience, decayScore float64
		var accessCount int

		if err := rows.Scan(&id, &userID, &sectorVal, &salience, &decayScore,
			&accessCount, &lastAccessed, &created, &summary, &content); err != nil {
			fmt.Fprintf(os.Stderr, "Scan error: %v\n", err)
			continue
		}

		// Use summary if available, otherwise truncated content
		display := summary
		if display == "" {
			display = content
		}
		if len(display) > 120 {
			display = display[:117] + "..."
		}

		// Sector emoji for quick visual scanning
		sectorIcon := sectorEmoji(sectorVal)

		fmt.Fprintf(w, "%d\t%s\t%s %s\t%.2f\t%.2f\t%d\t%s\t%s\t%s\n",
			id, shortUser(userID), sectorIcon, sectorVal, salience, decayScore,
			accessCount, shortTime(lastAccessed), shortTime(created), display)
		count++
	}
	w.Flush()

	if count == 0 {
		fmt.Println("\n(no memories found)")
	} else {
		fmt.Printf("\n%d memories shown\n", count)
	}
}

func printWaypoints(db *sql.DB) {
	// Show waypoints with their linked memories
	rows, err := db.Query(`
		SELECT w.id, w.entity_text, w.entity_type, COUNT(a.memory_id) as links,
		       AVG(a.weight) as avg_weight
		FROM waypoints w
		LEFT JOIN associations a ON a.waypoint_id = w.id
		GROUP BY w.id
		ORDER BY links DESC`)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Query error: %v\n", err)
		os.Exit(1)
	}
	defer rows.Close()

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "WAYPOINT\tTYPE\tLINKS\tAVG WEIGHT")
	fmt.Fprintln(w, "────────\t────\t─────\t──────────")

	count := 0
	for rows.Next() {
		var id, links int
		var entity, entityType string
		var avgWeight float64

		if err := rows.Scan(&id, &entity, &entityType, &links, &avgWeight); err != nil {
			continue
		}
		fmt.Fprintf(w, "%s\t%s\t%d\t%.3f\n", entity, entityType, links, avgWeight)
		count++
	}
	w.Flush()

	if count == 0 {
		fmt.Println("\n(no waypoints found)")
	} else {
		fmt.Printf("\n%d waypoints\n", count)
	}

	// Show associations detail
	fmt.Println("\n── Associations ──")
	assocRows, err := db.Query(`
		SELECT w.entity_text, m.id, m.sector, substr(m.summary, 1, 60), a.weight
		FROM associations a
		JOIN waypoints w ON w.id = a.waypoint_id
		JOIN memories m ON m.id = a.memory_id
		ORDER BY w.entity_text, a.weight DESC`)
	if err != nil {
		return
	}
	defer assocRows.Close()

	for assocRows.Next() {
		var entity, sectorVal, summary string
		var memID int
		var weight float64
		if err := assocRows.Scan(&entity, &memID, &sectorVal, &summary, &weight); err != nil {
			continue
		}
		if len(summary) > 50 {
			summary = summary[:47] + "..."
		}
		fmt.Printf("  %s → mem#%d [%s] (w=%.3f) %s\n", entity, memID, sectorVal, weight, summary)
	}
}

func printStats(db *sql.DB) {
	fmt.Println("── cogmem Statistics ──\n")

	// Total memories
	var total int
	db.QueryRow("SELECT COUNT(*) FROM memories").Scan(&total)
	fmt.Printf("Total memories:  %d\n", total)

	// By sector
	fmt.Println("\nBy sector:")
	rows, _ := db.Query("SELECT sector, COUNT(*), AVG(salience), AVG(decay_score) FROM memories GROUP BY sector ORDER BY COUNT(*) DESC")
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var sectorVal string
			var count int
			var avgSalience, avgDecay float64
			rows.Scan(&sectorVal, &count, &avgSalience, &avgDecay)
			fmt.Printf("  %s %-12s  %3d memories  avg_salience=%.2f  avg_decay=%.2f\n",
				sectorEmoji(sectorVal), sectorVal, count, avgSalience, avgDecay)
		}
	}

	// By user
	fmt.Println("\nBy user:")
	userRows, _ := db.Query("SELECT user_id, COUNT(*) FROM memories GROUP BY user_id ORDER BY COUNT(*) DESC LIMIT 20")
	if userRows != nil {
		defer userRows.Close()
		for userRows.Next() {
			var userID string
			var count int
			userRows.Scan(&userID, &count)
			fmt.Printf("  %-30s  %d memories\n", userID, count)
		}
	}

	// Waypoints
	var wpCount int
	db.QueryRow("SELECT COUNT(*) FROM waypoints").Scan(&wpCount)
	var assocCount int
	db.QueryRow("SELECT COUNT(*) FROM associations").Scan(&assocCount)
	fmt.Printf("\nWaypoints:     %d\n", wpCount)
	fmt.Printf("Associations:  %d\n", assocCount)

	// Vectors
	var vecCount int
	db.QueryRow("SELECT COUNT(*) FROM vectors").Scan(&vecCount)
	fmt.Printf("Vectors:       %d\n", vecCount)

	// DB file size
	var pageCount, pageSize int
	db.QueryRow("PRAGMA page_count").Scan(&pageCount)
	db.QueryRow("PRAGMA page_size").Scan(&pageSize)
	sizeBytes := pageCount * pageSize
	fmt.Printf("\nDB size:       %.1f KB\n", float64(sizeBytes)/1024)
}

// --- Helpers ---

func sectorEmoji(s string) string {
	switch s {
	case "episodic":
		return "📅"
	case "semantic":
		return "📚"
	case "procedural":
		return "⚙️"
	case "emotional":
		return "💜"
	case "reflective":
		return "🔮"
	default:
		return "  "
	}
}

func shortUser(u string) string {
	if len(u) > 25 {
		return u[:22] + "..."
	}
	return u
}

func shortTime(t string) string {
	// "2006-01-02 15:04:05" → "01-02 15:04"
	if len(t) >= 16 {
		parts := strings.SplitN(t, " ", 2)
		if len(parts) == 2 {
			dateParts := strings.SplitN(parts[0], "-", 3)
			if len(dateParts) == 3 {
				return dateParts[1] + "-" + dateParts[2] + " " + parts[1][:5]
			}
		}
	}
	return t
}
