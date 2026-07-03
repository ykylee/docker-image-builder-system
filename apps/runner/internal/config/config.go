package config

import "time"

type Config struct {
	PollInterval      time.Duration
	HostServerBaseURL string
}

func Load() Config {
	return Config{
		PollInterval:      5 * time.Second,
		HostServerBaseURL: "http://127.0.0.1:3000",
	}
}
