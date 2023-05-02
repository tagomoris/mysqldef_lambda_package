FROM public.ecr.aws/lambda/nodejs:18
# https://hub.docker.com/r/amazon/aws-lambda-nodejs
RUN yum install -y git && yum -y clean all  && rm -rf /var/cache
COPY tmp/mysqldef ${LAMBDA_TASK_ROOT}
RUN mkdir ${LAMBDA_TASK_ROOT}/deploy_keys
RUN chmod 700 ${LAMBDA_TASK_ROOT}/deploy_keys
COPY index.mjs ${LAMBDA_TASK_ROOT}
COPY deploy_keys/* ${LAMBDA_TASK_ROOT}/deploy_keys
RUN chmod 600 ${LAMBDA_TASK_ROOT}/deploy_keys/*
CMD ["index.handler"]  
