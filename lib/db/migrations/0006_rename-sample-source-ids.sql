-- Custom SQL migration file, put your code below! --
-- Sources are named by connection now (ADR 0002): the sample sources are "sample:<product>".
UPDATE "threads" SET "source_id" = 'sample:' || "source_id"
WHERE "source_id" IN ('jira', 'confluence', 'codebeamer');
