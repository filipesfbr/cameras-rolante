import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

let client: S3Client | undefined;

function s3() {
  // o R2 não implementa parte dos checksums x-amz-checksum-* que o SDK v3 manda por padrão
  return (client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  }));
}

const Bucket = () => process.env.R2_BUCKET ?? '';

export const publicUrl = (key: string) => `${process.env.R2_PUBLIC_URL}/${key}`;

export async function put(key: string, body: Buffer | string, contentType: string, cacheControl?: string) {
  await s3().send(
    new PutObjectCommand({ Bucket: Bucket(), Key: key, Body: body, ContentType: contentType, CacheControl: cacheControl }),
  );
}

/** null se o objeto não existe */
export async function getText(key: string): Promise<string | null> {
  try {
    const r = await s3().send(new GetObjectCommand({ Bucket: Bucket(), Key: key }));
    return (await r.Body?.transformToString()) ?? null;
  } catch (e) {
    if ((e as { name?: string }).name === 'NoSuchKey') return null;
    throw e;
  }
}

/** Lista tudo sob o prefixo (pagina sozinho). Com delimiter '/', `prefixes` traz as "subpastas". */
export async function list(prefix: string, delimiter?: string) {
  const keys: string[] = [];
  const prefixes: string[] = [];
  let token: string | undefined;
  do {
    const r = await s3().send(
      new ListObjectsV2Command({ Bucket: Bucket(), Prefix: prefix, Delimiter: delimiter, ContinuationToken: token }),
    );
    for (const o of r.Contents ?? []) if (o.Key) keys.push(o.Key);
    for (const p of r.CommonPrefixes ?? []) if (p.Prefix) prefixes.push(p.Prefix);
    token = r.NextContinuationToken;
  } while (token);
  return { keys, prefixes };
}

export async function del(keys: string[]) {
  for (let i = 0; i < keys.length; i += 1000) {
    const r = await s3().send(
      new DeleteObjectsCommand({
        Bucket: Bucket(),
        Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
      }),
    );
    if (r.Errors?.length) throw new Error(`falha ao apagar ${r.Errors.length} objetos: ${r.Errors[0].Message}`);
  }
}
