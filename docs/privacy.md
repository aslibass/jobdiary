# JobDiary Privacy Policy

**Last updated:** 2025-12-30

This Privacy Policy explains how the **JobDiary API** (the “Service”) collects, uses, and protects information when you use the API, including via an OpenAI Custom GPT “Actions” integration.

## What data the Service stores

When you call the Service, it may store the following data in its database:

- **User identifier (`user_id`)**: A stable identifier you provide (for MVP, this may be a string you control).
- **Jobs**: Job name, address (optional), client name (optional), status, and a JSON “job state” snapshot.
- **Entries**: Voice diary entry timestamp, transcript text, optional summary text, and optional structured extraction JSON.
- **Operational metadata**: Timestamps such as created/updated times.

## What data the Service does not intentionally collect

- **No payment data** is collected by the Service.
- **No marketing profiles** are created by the Service.

## How the Service uses data

Data is used to:

- Store and retrieve your job diary entries
- Maintain current job state snapshots
- Support search and recall within a job
- Operate and secure the Service (authentication and abuse prevention)

## Data sharing

The Service does **not** sell your data.

Data is shared only as needed to operate the Service:

- **Hosting provider**: The Service is hosted on Railway; your data is stored in a Railway-hosted PostgreSQL database.
- **Your client**: Data is returned to the caller of the API when properly authenticated.

## Authentication and access control

- The Service uses an API key (via the `X-API-Key` header) to authenticate requests.
- The Service enforces user isolation by scoping reads/writes using the `user_id` you provide.

## Data retention

Data is retained until you delete it or request deletion. (The MVP API does not yet include deletion endpoints; data can be removed manually by the operator upon request.)

## Security

We take reasonable measures to protect data, including:

- API-key based access control
- Database access restricted to the hosting environment

No system can be guaranteed 100% secure. You should avoid submitting sensitive information in transcripts.

## Your choices

- You control what you send in job names, addresses, and transcripts.
- You may request deletion of data by contacting the operator.

## Contact

For privacy questions or deletion requests, contact:

- **Email:** `REPLACE_WITH_YOUR_EMAIL`

## Changes to this policy

We may update this policy from time to time. The “Last updated” date will reflect the latest version.


