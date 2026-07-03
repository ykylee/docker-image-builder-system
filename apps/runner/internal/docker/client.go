package docker

import "context"

type Client struct{}

func NewClient() *Client {
	return &Client{}
}

func (c *Client) BuildImage(context.Context, string) error {
	return nil
}
