FROM public.ecr.aws/lambda/nodejs:18
# https://hub.docker.com/r/amazon/aws-lambda-nodejs
RUN yum install -y git
COPY tmp/mysqldef ${LAMBDA_TASK_ROOT}
COPY index.mjs ${LAMBDA_TASK_ROOT}
COPY deploy_keys ${LAMBDA_TASK_ROOT}
COPY schema.sql ${LAMBDA_TASK_ROOT}
CMD ["index.handler"]  
