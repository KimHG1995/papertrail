ALTER TABLE "template_version" ALTER COLUMN "schema_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "template_version" ADD COLUMN "schema" jsonb;