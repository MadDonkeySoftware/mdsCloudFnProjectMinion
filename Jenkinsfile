pipeline {
    agent any

    stages {
        stage('Install Dependencies') {
            steps {
                sh 'npm i'
            }
        }
        stage('Verification') {
            steps {
                parallel(
                    "testing": {
                        sh 'npm run test-cov'
                    },
                    "linting": {
                        sh 'npm run lint'
                    }
                )
            }
        }
        stage('Publish') {
            when { branch 'master' }
            steps {
                sh 'docker build -t 192.168.5.90:5000/frito/mds-fnproject-minion:latest .'
                sh 'docker push 192.168.5.90:5000/frito/mds-fnproject-minion:latest'
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'coverage/lcov-report/**/*', fingerprint: true
        }
    }
}
